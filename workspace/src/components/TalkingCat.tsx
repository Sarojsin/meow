import React, { useEffect, useMemo } from 'react';
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  RenderCallbackContext,
  useAnimator,
  useFilamentContext,
  useModel,
  type FilamentAnimator,
  type FrameInfo,
  type TransformManager,
} from 'react-native-filament';
import { useSharedValue, type ISharedValue } from 'react-native-worklets-core';
import catGlb from '../assets/models/cat.glb';
import { assistantManager } from '../assistant/AssistantManager';
import type { IAssistantRenderDriver } from '../assistant/AnimationController';
import type { GestureId } from '../assistant/types';

/**
 * TalkingCat
 * --------------------------------------------------------------------------
 * Renders the 3D cat and applies the AnimationController's intents to the
 * Filament engine every frame.
 *
 * Threading model (react-native-filament requirement):
 *  - All engine calls (animator / transformManager) must happen inside the
 *    per-frame render callback, which runs on the worklet thread.
 *  - The AnimationController runs on the JS thread and publishes compact pose
 *    params into a shared value; the worklet reads them and pushes to Filament.
 *
 * Performance notes:
 *  - The model is loaded once via `useModel` and stays mounted for the whole
 *    app session (the parent toggles visibility, never unmounts us).
 *  - Exactly one render callback drives clip + procedural bones, so no
 *    double-application of `applyAnimation`/`updateBoneMatrices`.
 */

/* ------------------------------ pose bridge ------------------------------ */

/** Compact per-frame pose produced by the AnimationController (JS thread). */
export interface PoseParams {
  jaw: number; // 0..1
  headTilt: number; // radians
  headNod: number; // radians
  blink: number; // 0..1
  breath: number; // 0..1
  tail: number; // radians
  ear: number; // 0..1
  gesture: GestureId | null;
  gestureWeight: number; // 0..1
  talking: boolean;
}

const INITIAL_POSE: PoseParams = {
  jaw: 0,
  headTilt: 0,
  headNod: 0,
  blink: 0,
  breath: 0,
  tail: 0,
  ear: 0,
  gesture: null,
  gestureWeight: 0,
  talking: false,
};

/** Model info resolved once on the JS thread, read by the worklet. */
export interface ModelInfo {
  clipIndex: number; // -1 when the asset has no usable clip
  clipDuration: number; // seconds
  rootEntity: number; // -1 until the asset has loaded
  bones: {
    head: number; // -1 when the rig has no matching bone (graceful no-op)
    tail: number;
    jaw: number;
    earL: number;
    earR: number;
    eyeL: number;
    eyeR: number;
  };
  /** Last applied rotation per channel + body scale, for delta compensation. */
  prev: Record<string, number>;
}

const EMPTY_PREV: ModelInfo['prev'] = {
  headNod: 0,
  headTilt: 0,
  tail: 0,
  jaw: 0,
  earL: 0,
  earR: 0,
  eyeL: 0,
  eyeR: 0,
  bodyScale: 1,
};

const EMPTY_MODEL_INFO: ModelInfo = {
  clipIndex: -1,
  clipDuration: 1,
  rootEntity: -1,
  bones: { head: -1, tail: -1, jaw: -1, earL: -1, earR: -1, eyeL: -1, eyeR: -1 },
  prev: EMPTY_PREV,
};

/**
 * Candidate bone names per semantic role (first hit wins). Names depend on the
 * rig; rename/add entries here without touching any logic. This model has no
 * jaw/eyelid bones, so those stay -1 and their intents become no-ops.
 */
const BONE_CANDIDATES: Record<keyof ModelInfo['bones'], readonly string[]> = {
  head: ['neck bone ik', 'Bone.009', 'Bone.008', 'Bone.006'],
  tail: ['tailik Bone', 'Bone.018', 'Bone.017', 'Bone.016'],
  jaw: ['jaw', 'Jaw', 'mouth', 'Bone.031', 'Bone.007'],
  earL: ['earL ik', 'Earik R..001'],
  earR: ['Earik R.', 'Earik R..001'],
  eyeL: ['eyeL', 'eye_l', 'Eye.L'],
  eyeR: ['eyeR', 'eye_r', 'Eye.R'],
};

/** Gesture pose presets (radians for rotations, units otherwise). */
const GESTURE_POSES: Record<
  GestureId,
  { nod: number; tilt: number; tail: number; ear: number }
> = {
  wave: { nod: 0.04, tilt: 0.12, tail: 0.35, ear: 0.3 },
  point: { nod: 0.1, tilt: 0.16, tail: 0.2, ear: 0.1 },
  thumbsUp: { nod: 0.12, tilt: 0.05, tail: 0.4, ear: 0.2 },
  headNod: { nod: 0.28, tilt: 0.02, tail: 0.1, ear: 0 },
  headTilt: { nod: 0.03, tilt: 0.3, tail: 0.15, ear: 0 },
  thinkingPose: { nod: 0.06, tilt: 0.24, tail: 0.3, ear: 0.25 },
  welcome: { nod: 0.16, tilt: 0.1, tail: 0.4, ear: 0.3 },
  celebrate: { nod: 0.3, tilt: 0.2, tail: 0.55, ear: 0.4 },
  listeningPose: { nod: 0.03, tilt: 0.08, tail: 0.05, ear: 0.12 },
};

const AXIS_X: readonly [number, number, number] = [1, 0, 0];
const AXIS_Z: readonly [number, number, number] = [0, 0, 1];

/**
 * Apply a *delta* rotation to a bone so the target angle is never compounded.
 *
 * Why deltas instead of absolute angles: some bones are driven by the baked
 * idle clip (which rewrites them every frame) and others are not. Applying the
 * incremental difference from the previously applied target works correctly in
 * both cases: on clip-driven bones the clip pose is kept and the offset is
 * layered on top; on static bones the rotation simply tracks the target.
 */
function applyRotationDelta(
  tm: TransformManager,
  id: number,
  axis: readonly [number, number, number],
  targetRadians: number,
  prev: Record<string, number>,
  key: string,
): void {
  'worklet';
  if (id < 0) {
    return;
  }
  const delta = targetRadians - prev[key];
  if (Math.abs(delta) > 0.0001) {
    tm.setEntityRotation({ id }, delta, axis as [number, number, number], true);
  }
  prev[key] = targetRadians;
}

/**
 * Per-frame worklet. Order is critical for skinned models:
 *   (1) applyAnimation  -> writes clip pose for animated nodes
 *   (2) procedural bones-> layered on top via deltas
 *   (3) updateBoneMatrices -> resolves skin into bone matrices
 */
function applyPoseToEngine(
  animator: FilamentAnimator | undefined,
  tm: TransformManager,
  modelInfoSV: ISharedValue<ModelInfo>,
  poseSV: ISharedValue<PoseParams>,
  frame: FrameInfo,
): void {
  'worklet';

  if (animator == null) {
    return;
  }
  const info = modelInfoSV.value;
  if (info.clipIndex < 0 || info.rootEntity < 0) {
    return;
  }

  // (1) Base idle clip, looped by wall time.
  animator.applyAnimation(info.clipIndex, frame.passedSeconds % info.clipDuration);

  const pose = poseSV.value;
  const gesture = pose.gesture != null ? GESTURE_POSES[pose.gesture] : undefined;
  const gW = pose.gestureWeight;
  const prev = info.prev;

  // (2) Procedural bones.
  const headTarget = pose.headNod + (gesture ? gesture.nod * gW : 0);
  applyRotationDelta(tm, info.bones.head, AXIS_X, headTarget, prev, 'headNod');
  const tiltTarget = pose.headTilt + (gesture ? gesture.tilt * gW : 0);
  applyRotationDelta(tm, info.bones.head, AXIS_Z, tiltTarget, prev, 'headTilt');

  const tailTarget = pose.tail + (gesture ? gesture.tail * gW : 0);
  applyRotationDelta(tm, info.bones.tail, AXIS_Z, tailTarget, prev, 'tail');

  // Jaw: negative angle so opening rotates the lower jaw downward.
  applyRotationDelta(tm, info.bones.jaw, AXIS_X, -pose.jaw * 0.5, prev, 'jaw');

  // Ears: mirrored directions around the local x-axis.
  const earTarget = pose.ear * 0.5 + (gesture ? gesture.ear * 0.5 * gW : 0);
  applyRotationDelta(tm, info.bones.earL, AXIS_X, earTarget, prev, 'earL');
  applyRotationDelta(tm, info.bones.earR, AXIS_X, -earTarget, prev, 'earR');

  // Eyelids (blink).
  const blinkTarget = pose.blink * 0.7;
  applyRotationDelta(tm, info.bones.eyeL, AXIS_X, blinkTarget, prev, 'eyeL');
  applyRotationDelta(tm, info.bones.eyeR, AXIS_X, blinkTarget, prev, 'eyeR');

  // Body breathing scale (root entity). The root is *not* animated by the clip
  // and keeps the transformToUnitCube scale, so delta composition is exact.
  const bodyTarget = 1 + pose.breath * 0.025;
  const bodyDelta = bodyTarget / prev.bodyScale;
  if (Math.abs(bodyDelta - 1) > 0.0001) {
    tm.setEntityScale({ id: info.rootEntity }, [bodyDelta, bodyDelta, bodyDelta], true);
  }
  prev.bodyScale = bodyTarget;

  // (3) Skinning.
  animator.updateBoneMatrices();
}

/* --------------------------- JS-side bridge driver ----------------------- */

/**
 * Implements IAssistantRenderDriver by publishing intents into the shared value
 * consumed by the worklet. Purely a data bridge.
 */
function createPoseBridgeDriver(poseSV: ISharedValue<PoseParams>): IAssistantRenderDriver {
  const patch = (partial: Partial<PoseParams>): void => {
    // Replace the object atomically so the worklet never sees a half-updated pose.
    poseSV.value = { ...poseSV.value, ...partial };
  };

  return {
    setJaw: (v) => patch({ jaw: v }),
    setHeadTilt: (v) => patch({ headTilt: v }),
    setHeadNod: (v) => patch({ headNod: v }),
    setBlink: (v) => patch({ blink: v }),
    setBreath: (v) => patch({ breath: v }),
    setTailSway: (v) => patch({ tail: v }),
    setEarTwitch: (v) => patch({ ear: v }),
    setGesture: (gesture, weight) => patch({ gesture, gestureWeight: weight }),
    update: () => {
      // No-op: the worklet pushes transforms once per rendered frame.
    },
  };
}

/* ------------------------------- components ------------------------------ */

interface CatSceneProps {
  size: number;
}

function CatScene({ size }: CatSceneProps) {
  const model = useModel(catGlb);
  const animator = useAnimator(model);
  const { transformManager } = useFilamentContext();

  const poseSV = useSharedValue<PoseParams>(INITIAL_POSE);
  const modelInfoSV = useSharedValue<ModelInfo>(EMPTY_MODEL_INFO);

  const driver = useMemo(() => createPoseBridgeDriver(poseSV), [poseSV]);

  // Resolve clips + bones + root once the asset has loaded, then hand the
  // animation loop over to the AssistantManager.
  useEffect(() => {
    if (model.state !== 'loaded' || animator == null) {
      return;
    }

    const asset = model.asset;

    // Choose the idle clip (prefer a name hint, fall back to the first clip).
    const clipCount = animator.getAnimationCount();
    let clipIndex = -1;
    let clipDuration = 1;
    if (clipCount > 0) {
      let preferred = 0;
      for (let i = 0; i < clipCount; i++) {
        const name = animator.getAnimationName(i).toLowerCase();
        if (name.includes('idle') || name.includes('breath') || name.includes('armature')) {
          preferred = i;
        }
      }
      clipIndex = preferred;
      clipDuration = Math.max(animator.getAnimationDuration(preferred), 0.001);
    }

    // Resolve bones by name (best-effort; -1 when the rig lacks the bone).
    const bones: ModelInfo['bones'] = {
      head: -1,
      tail: -1,
      jaw: -1,
      earL: -1,
      earR: -1,
      eyeL: -1,
      eyeR: -1,
    };
    for (const role of Object.keys(BONE_CANDIDATES) as Array<keyof ModelInfo['bones']>) {
      for (const candidate of BONE_CANDIDATES[role]) {
        const entity = asset.getFirstEntityByName(candidate);
        if (entity != null) {
          bones[role] = entity.id;
          break;
        }
      }
    }

    // Normalize the model to a unit cube so the fixed camera frames it. The
    // asset root is not targeted by the clip, so this is never overwritten.
    try {
      transformManager.transformToUnitCube(model.rootEntity, model.boundingBox);
    } catch (error) {
      if (__DEV__) {
        console.warn('[assistant] transformToUnitCube failed', error);
      }
    }

    modelInfoSV.value = {
      clipIndex,
      clipDuration,
      rootEntity: model.rootEntity.id,
      bones,
      prev: EMPTY_PREV,
    };

    assistantManager.attachRenderer(driver);

    return () => {
      assistantManager.releaseRenderer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.state, animator, transformManager, driver]);

  // Per-frame worklet that pushes the pose to the engine.
  RenderCallbackContext.useRenderCallback(
    (frame) => {
      'worklet';
      applyPoseToEngine(animator, transformManager, modelInfoSV, poseSV, frame);
    },
    [animator, transformManager, modelInfoSV, poseSV],
  );

  return (
    <FilamentView style={{ width: size, height: size }} enableTransparentRendering>
      <DefaultLight />
      <Camera cameraPosition={[0, 0.05, 3.5]} cameraTarget={[0, 0, 0]} cameraUp={[0, 1, 0]} />
    </FilamentView>
  );
}

export interface TalkingCatProps {
  /** Render size in points (square). */
  size: number;
}

/**
 * Public wrapper. Provides the Filament context, which must wrap all filament
 * hooks and the <FilamentView>. Keep this mounted for the app's lifetime.
 */
export function TalkingCat({ size }: TalkingCatProps): React.ReactElement {
  return (
    <FilamentScene>
      <CatScene size={size} />
    </FilamentScene>
  );
}

import type { GestureId } from './types';
import { GESTURE_INTERVAL_MAX_MS, GESTURE_INTERVAL_MIN_MS } from './config';

/**
 * Reusable gesture controller.
 *
 * Responsibilities:
 *  1. Maintain a registry of available gestures (extensible at runtime).
 *  2. Pick a random gesture every 2–4 seconds while talking, never repeating
 *     the current one back-to-back.
 *  3. Expose per-gesture config (weight, duration) so the animation layer can
 *     blend them smoothly.
 *
 * The controller is pure scheduling logic – it has no knowledge of the 3D
 * engine. It reports gesture selections through a listener callback.
 */

export interface GestureDefinition {
  id: GestureId;
  /** Relative chance of being picked (default 1). */
  weight?: number;
  /** How long the gesture is held before blending back, in ms. */
  durationMs?: number;
  /** Gestures that are only used visually (e.g. listening pose). */
  visualOnly?: boolean;
}

export interface GestureSelection {
  gesture: GestureId;
  /** 0..1 intensity/weight the renderer should use. */
  weight: number;
}

export type GestureListener = (selection: GestureSelection) => void;

const DEFAULT_DURATION_MS = 1400;

/** Built-in gestures per the spec. The listening pose is visual-only. */
const BUILT_IN_GESTURES: readonly GestureDefinition[] = [
  { id: 'wave', weight: 1 },
  { id: 'point', weight: 0.8 },
  { id: 'thumbsUp', weight: 0.8 },
  { id: 'headNod', weight: 0.7 },
  { id: 'headTilt', weight: 0.7 },
  { id: 'thinkingPose', weight: 0.6 },
  { id: 'welcome', weight: 0.6 },
  { id: 'celebrate', weight: 0.5 },
  { id: 'listeningPose', weight: 0, visualOnly: true },
];

export class GestureController {
  private readonly gestures: GestureDefinition[];
  private readonly minIntervalMs: number;
  private readonly maxIntervalMs: number;
  private readonly scheduler: (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  private readonly cancelScheduler: (handle: ReturnType<typeof setTimeout>) => void;

  private current: GestureId | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listener: GestureListener | null = null;
  private started = false;

  constructor(options?: {
    gestures?: readonly GestureDefinition[];
    minIntervalMs?: number;
    maxIntervalMs?: number;
    scheduler?: (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    cancelScheduler?: (handle: ReturnType<typeof setTimeout>) => void;
  }) {
    this.gestures = [...(options?.gestures ?? BUILT_IN_GESTURES)];
    this.minIntervalMs = options?.minIntervalMs ?? GESTURE_INTERVAL_MIN_MS;
    this.maxIntervalMs = options?.maxIntervalMs ?? GESTURE_INTERVAL_MAX_MS;
    this.scheduler = options?.scheduler ?? ((fn, delay) => setTimeout(fn, delay));
    this.cancelScheduler =
      options?.cancelScheduler ?? ((handle) => clearTimeout(handle));
  }

  /** The gesture currently being performed, if any. */
  getCurrentGesture(): GestureId | null {
    return this.current;
  }

  /**
   * Starts random gesture scheduling. Every 2–4 seconds a gesture is picked
   * and passed to the listener. Only one scheduler runs at a time.
   */
  start(listener: GestureListener): void {
    this.stop();
    this.started = true;
    this.listener = listener;
    this.scheduleNext();
  }

  /** Stops scheduling and clears the current gesture. */
  stop(): void {
    this.started = false;
    this.listener = null;
    this.current = null;
    if (this.timer) {
      this.cancelScheduler(this.timer);
      this.timer = null;
    }
  }

  /** Manually trigger a gesture now (used for one-off welcome/celebrate). */
  playOnce(gesture: GestureId): void {
    this.current = gesture;
    this.listener?.({ gesture, weight: 1 });
  }

  /** True while the scheduler is running. */
  isActive(): boolean {
    return this.started;
  }

  private scheduleNext(): void {
    if (!this.started) {
      return;
    }
    const delay =
      this.minIntervalMs +
      Math.random() * Math.max(0, this.maxIntervalMs - this.minIntervalMs);

    this.timer = this.scheduler(() => {
      this.timer = null;
      if (!this.started) {
        return;
      }
      const picked = this.pickNext();
      this.current = picked.gesture;
      this.listener?.({ gesture: picked.gesture, weight: picked.weight });
      this.scheduleNext();
    }, delay);
  }

  /**
   * Weighted random selection that never returns the gesture currently
   * playing, and skips visual-only gestures.
   */
  pickNext(): GestureSelection {
    const pool = this.gestures.filter(
      (g) => !g.visualOnly && (g.weight ?? 1) > 0 && g.id !== this.current,
    );
    const eligible = pool.length > 0 ? pool : this.gestures.filter((g) => !g.visualOnly);

    const totalWeight = eligible.reduce((sum, g) => sum + (g.weight ?? 1), 0);
    let roll = Math.random() * totalWeight;
    let picked = eligible[0];
    for (const gesture of eligible) {
      roll -= gesture.weight ?? 1;
      if (roll <= 0) {
        picked = gesture;
        break;
      }
    }

    return {
      gesture: picked.id,
      weight: Math.min(1, Math.max(0, picked.weight ?? 1)),
    };
  }

  /** Look up metadata for a gesture (for renderer blending). */
  getDefinition(gesture: GestureId): GestureDefinition | undefined {
    return this.gestures.find((g) => g.id === gesture);
  }

  getDurationMs(gesture: GestureId): number {
    return this.getDefinition(gesture)?.durationMs ?? DEFAULT_DURATION_MS;
  }
}

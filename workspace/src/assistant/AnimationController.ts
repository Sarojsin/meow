import type { AssistantState, GestureId } from './types';
import { GestureController } from './GestureController';
import {
  ANIMATION_BLEND_MS,
  BLINK_CLOSED_MS,
  BLINK_EASE_MS,
  BLINK_INTERVAL_MAX_MS,
  BLINK_INTERVAL_MIN_MS,
  BREATHING_WEIGHT_IDLE,
  BREATHING_WEIGHT_TALKING,
  BREATH_PERIOD_MS,
  EAR_INTERVAL_MAX_MS,
  EAR_INTERVAL_MIN_MS,
  EAR_TWITCH_DURATION_MS,
  HEAD_INTERVAL_MAX_MS,
  HEAD_INTERVAL_MIN_MS,
  HEAD_MOVE_DURATION_MS,
  MOUTH_IDLE_OPEN,
  MOUTH_MAX_OPEN,
  MOUTH_MOVEMENTS_PER_SECOND_MAX,
  MOUTH_MOVEMENTS_PER_SECOND_MIN,
  TAIL_INTERVAL_MAX_MS,
  TAIL_INTERVAL_MIN_MS,
  TAIL_SWAY_DURATION_MS,
} from './config';

/**
 * Renderer abstraction consumed by the AnimationController.
 *
 * The controller produces *intents* (jaw open amount, gesture, blink …) and
 * the concrete driver applies them to the 3D engine. This keeps all
 * animation *logic* independent of react-native-filament (or any future
 * engine) and trivially testable.
 *
 * Note: base idle clip playback and per-frame blending of baked gesture clips
 * (when they exist in the asset) are handled by the renderer itself; the
 * controller only ever produces the procedural intents below.
 */
export interface IAssistantRenderDriver {
  /** Jaw opening, 0 (closed) .. 1 (fully open). */
  setJaw(open01: number): void;

  /** Head tilt around the z-axis in radians (subtle). */
  setHeadTilt(radians: number): void;

  /** Head nod around the x-axis in radians (subtle). */
  setHeadNod(radians: number): void;

  /** Eyelid closure, 0 (open) .. 1 (closed). */
  setBlink(close01: number): void;

  /** Body scale pulse (breathing), 0..1. */
  setBreath(amount01: number): void;

  /** Tail sway angle in radians around the base of the tail. */
  setTailSway(radians: number): void;

  /** Ear twitch amount, 0..1 (may not exist on every rig). */
  setEarTwitch(amount01: number): void;

  /** Currently selected gesture, or null to clear. `weight` is 0..1. */
  setGesture(gesture: GestureId | null, weight: number): void;

  /** Push all pending transforms to the engine (once per frame). */
  update(): void;
}

interface ActiveGesture {
  id: GestureId;
  remainingMs: number;
  totalMs: number;
}

/** Random integer in [min, max]. */
const randBetween = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** Clamp to [0, 1]. */
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export class AnimationController {
  private driver: IAssistantRenderDriver | null = null;
  private gestureController = new GestureController();

  private running = false;
  private paused = false;
  private state: AssistantState = 'IDLE';
  private elapsedMs = 0;
  private lastTickMs: number | null = null;

  /** 0..1 blend between idle and talking poses. */
  private speechBlend = 0;
  private amplitude = 0;

  /* ------------------------------ idle timing ----------------------------- */
  private nextBlinkAtMs = 0;
  private blinkProgressMs = 0; // drives one blink event once scheduled
  private nextTailAtMs = 0;
  private tailProgressMs = 0;
  private nextHeadAtMs = 0;
  private headProgressMs = 0;
  private nextEarAtMs = 0;
  private earProgressMs = 0;

  /* ------------------------------- mouth state ---------------------------- */
  private mouthPhase = 0; // 0..1 within one open/close cycle
  private mouthHz = (MOUTH_MOVEMENTS_PER_SECOND_MIN + MOUTH_MOVEMENTS_PER_SECOND_MAX) / 2;
  private mouthAmplitude = MOUTH_IDLE_OPEN;

  /* ------------------------------- gestures ------------------------------- */
  private activeGesture: ActiveGesture | null = null;

  constructor() {
    this.gestureController = new GestureController();
  }

  /**
   * (Re)starts the random gesture scheduler. `start()` clears any previous
   * scheduler state, so this is safe to call on every transition to TALKING.
   */
  private startGestureScheduling(): void {
    this.gestureController.start((selection) => {
      const durationMs = this.gestureController.getDurationMs(selection.gesture);
      this.activeGesture = {
        id: selection.gesture,
        remainingMs: durationMs,
        totalMs: durationMs,
      };
    });
  }

  /* ------------------------------- lifecycle ------------------------------ */

  attachDriver(driver: IAssistantRenderDriver): void {
    this.driver = driver;
    if (!this.running) {
      return;
    }
    this.lastTickMs = null;
  }

  detachDriver(): void {
    this.driver = null;
    this.lastTickMs = null;
  }

  /** Begin the animation loop (called when the 3D view mounts). */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.paused = false;
    this.lastTickMs = null;
    this.elapsedMs = 0;
    this.scheduleInitialIdle();
  }

  /** Tear down timers/state (called when the 3D view unmounts). */
  stop(): void {
    this.running = false;
    this.gestureController.stop();
    this.driver = null;
    this.lastTickMs = null;
  }

  /** Pause animation (app backgrounded, or assistant hidden). */
  pause(): void {
    this.paused = true;
    this.gestureController.stop();
    this.lastTickMs = null;
  }

  /** Resume animation after pause. */
  resume(): void {
    this.paused = false;
    this.lastTickMs = null;
    if (this.state !== 'IDLE') {
      this.startGestureScheduling();
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /* ------------------------------ state control --------------------------- */

  /** Called whenever the assistant FSM changes state. */
  setState(state: AssistantState): void {
    if (state === this.state) {
      return;
    }
    this.state = state;

    if (state === 'TALKING') {
      this.startGestureScheduling();
    } else {
      this.gestureController.stop();
      this.activeGesture = null;
    }
  }

  /** Play a one-off gesture (e.g. welcome on app open). */
  playOnce(gesture: GestureId): void {
    this.gestureController.playOnce(gesture);
    const durationMs = this.gestureController.getDurationMs(gesture);
    this.activeGesture = { id: gesture, remainingMs: durationMs, totalMs: durationMs };
  }

  /**
   * Feed a live audio amplitude level (0..1) if one becomes available in a
   * future version. When 0/no provider, the controller falls back to a
   * time-based 6-8 open/close cycles per second.
   */
  setAmplitude(amplitude01: number): void {
    this.amplitude = clamp01(amplitude01);
  }

  /* ------------------------------ main tick ------------------------------- */

  /**
   * Advance the animation by the elapsed time since the previous call.
   * Call once per frame from the renderer's animation loop.
   */
  tick(nowMs: number): void {
    if (!this.running || this.paused || !this.driver) {
      return;
    }

    const dtMs =
      this.lastTickMs === null ? 0 : Math.min(nowMs - this.lastTickMs, 100);
    this.lastTickMs = nowMs;
    if (dtMs <= 0) {
      return;
    }

    this.elapsedMs += dtMs;

    const targetBlend = this.targetSpeechBlend();
    if (this.speechBlend < targetBlend) {
      this.speechBlend = Math.min(targetBlend, this.speechBlend + dtMs / ANIMATION_BLEND_MS);
    } else if (this.speechBlend > targetBlend) {
      this.speechBlend = Math.max(targetBlend, this.speechBlend - dtMs / ANIMATION_BLEND_MS);
    }

    const driver = this.driver;

    // Breathing is always on, but softened while talking.
    const breathCycle = (this.elapsedMs % BREATH_PERIOD_MS) / BREATH_PERIOD_MS;
    const breathAmount = 0.5 + 0.5 * Math.sin(breathCycle * Math.PI * 2);
    const breathingWeight =
      BREATHING_WEIGHT_IDLE +
      (BREATHING_WEIGHT_TALKING - BREATHING_WEIGHT_IDLE) * this.speechBlend;
    driver.setBreath(breathAmount * breathingWeight);

    this.tickIdleBehaviours(dtMs, driver);
    this.tickMouth(dtMs, driver);
    this.tickGesture(dtMs, driver);

    driver.update();
  }

  private targetSpeechBlend(): number {
    return this.state === 'TALKING' ? 1 : 0;
  }

  /* ----------------------------- idle behaviours -------------------------- */

  private scheduleInitialIdle(): void {
    this.nextBlinkAtMs = this.elapsedMs + randBetween(BLINK_INTERVAL_MIN_MS, BLINK_INTERVAL_MAX_MS);
    this.nextTailAtMs = this.elapsedMs + randBetween(TAIL_INTERVAL_MIN_MS, TAIL_INTERVAL_MAX_MS);
    this.nextHeadAtMs = this.elapsedMs + randBetween(HEAD_INTERVAL_MIN_MS, HEAD_INTERVAL_MAX_MS);
    this.nextEarAtMs = this.elapsedMs + randBetween(EAR_INTERVAL_MIN_MS, EAR_INTERVAL_MAX_MS);
  }

  private tickIdleBehaviours(dtMs: number, driver: IAssistantRenderDriver): void {
    /* Blink: every 3–8 seconds. A single blink takes ~310 ms. */
    if (this.nextBlinkAtMs <= this.elapsedMs) {
      this.blinkProgressMs = 0;
      this.nextBlinkAtMs = this.elapsedMs + randBetween(BLINK_INTERVAL_MIN_MS, BLINK_INTERVAL_MAX_MS);
    }
    if (this.blinkProgressMs >= 0) {
      this.blinkProgressMs += dtMs;
      const closed = BLINK_EASE_MS * 2 + BLINK_CLOSED_MS;
      let close01: number;
      if (this.blinkProgressMs < BLINK_EASE_MS) {
        close01 = this.blinkProgressMs / BLINK_EASE_MS;
      } else if (this.blinkProgressMs < BLINK_EASE_MS + BLINK_CLOSED_MS) {
        close01 = 1;
      } else if (this.blinkProgressMs < closed) {
        close01 = 1 - (this.blinkProgressMs - BLINK_EASE_MS - BLINK_CLOSED_MS) / BLINK_EASE_MS;
      } else {
        close01 = 0;
        this.blinkProgressMs = -1;
      }
      driver.setBlink(easeInOut(clamp01(close01)));
    }

    /* Tail sway: every 2–5 seconds, one smooth oscillation. */
    if (this.nextTailAtMs <= this.elapsedMs) {
      this.tailProgressMs = 0;
      this.nextTailAtMs = this.elapsedMs + randBetween(TAIL_INTERVAL_MIN_MS, TAIL_INTERVAL_MAX_MS);
    }
    if (this.tailProgressMs >= 0) {
      this.tailProgressMs += dtMs;
      if (this.tailProgressMs >= TAIL_SWAY_DURATION_MS) {
        this.tailProgressMs = -1;
        driver.setTailSway(0);
      } else {
        const phase = this.tailProgressMs / TAIL_SWAY_DURATION_MS;
        const sway = Math.sin(phase * Math.PI * 2) * 0.18;
        driver.setTailSway(sway * (1 - this.speechBlend * 0.7));
      }
    }

    /* Subtle head movement: every 6–10 seconds. */
    if (this.nextHeadAtMs <= this.elapsedMs) {
      this.headProgressMs = 0;
      this.nextHeadAtMs = this.elapsedMs + randBetween(HEAD_INTERVAL_MIN_MS, HEAD_INTERVAL_MAX_MS);
    }
    if (this.headProgressMs >= 0) {
      this.headProgressMs += dtMs;
      if (this.headProgressMs >= HEAD_MOVE_DURATION_MS) {
        this.headProgressMs = -1;
        driver.setHeadNod(0);
        driver.setHeadTilt(0);
      } else {
        const phase = (this.headProgressMs / HEAD_MOVE_DURATION_MS) * Math.PI * 2;
        const envelope = easeInOut(Math.min(1, this.headProgressMs / (HEAD_MOVE_DURATION_MS * 0.5)));
        driver.setHeadNod(Math.sin(phase) * 0.05 * envelope);
        driver.setHeadTilt(Math.sin(phase * 0.7 + 1) * 0.06 * envelope);
      }
    }

    /* Ear twitch: every 5–12 seconds, one quick flick. */
    if (this.nextEarAtMs <= this.elapsedMs) {
      this.earProgressMs = 0;
      this.nextEarAtMs = this.elapsedMs + randBetween(EAR_INTERVAL_MIN_MS, EAR_INTERVAL_MAX_MS);
    }
    if (this.earProgressMs >= 0) {
      this.earProgressMs += dtMs;
      if (this.earProgressMs >= EAR_TWITCH_DURATION_MS) {
        this.earProgressMs = -1;
        driver.setEarTwitch(0);
      } else {
        const phase = (this.earProgressMs / EAR_TWITCH_DURATION_MS) * Math.PI;
        driver.setEarTwitch(Math.sin(phase) * 0.9);
      }
    }
  }

  /* ------------------------------- mouth sync ----------------------------- */

  private tickMouth(dtMs: number, driver: IAssistantRenderDriver): void {
    if (this.state !== 'TALKING') {
      // Slight idle lip movement, linked to breathing so the face never
      // freezes, then snap back to neutral for the talking blend.
      driver.setJaw(MOUTH_IDLE_OPEN * (0.5 + 0.5 * Math.sin((this.elapsedMs / BREATH_PERIOD_MS) * Math.PI * 2)));
      return;
    }

    const hz = this.amplitude > 0 ? 6 + this.amplitude * 4 : this.mouthHz;
    this.mouthPhase += (hz * dtMs) / 1000;
    if (this.mouthPhase >= 1) {
      this.mouthPhase -= 1;
      // Randomise the next cycle's frequency within 6–8 movements/second.
      this.mouthHz =
        MOUTH_MOVEMENTS_PER_SECOND_MIN +
        Math.random() * (MOUTH_MOVEMENTS_PER_SECOND_MAX - MOUTH_MOVEMENTS_PER_SECOND_MIN);
      // Randomise per-cycle amplitude for a natural, organic feel.
      this.mouthAmplitude = 0.55 + Math.random() * 0.45;
    }

    const effectiveAmplitude = this.amplitude > 0 ? this.amplitude : this.mouthAmplitude;
    // Asymmetric waveform: opens a touch faster than it closes.
    const wave = this.mouthPhase < 0.45 ? this.mouthPhase / 0.45 : 1 - (this.mouthPhase - 0.45) / 0.55;
    const jaw = clamp01(wave) * effectiveAmplitude * MOUTH_MAX_OPEN;
    driver.setJaw(jaw);
  }

  /* -------------------------------- gestures ------------------------------ */

  private tickGesture(dtMs: number, driver: IAssistantRenderDriver): void {
    if (!this.activeGesture) {
      driver.setGesture(null, 0);
      return;
    }

    this.activeGesture.remainingMs -= dtMs;
    if (this.activeGesture.remainingMs <= 0) {
      this.activeGesture = null;
      driver.setGesture(null, 0);
      return;
    }

    // Blend in quickly, hold, blend out near the end.
    const blendInMs = Math.min(220, this.activeGesture.totalMs * 0.2);
    const blendOutMs = Math.min(300, this.activeGesture.totalMs * 0.3);
    const tIn = 1 - this.activeGesture.remainingMs / this.activeGesture.totalMs;
    let weight = clamp01(tIn / (blendInMs / this.activeGesture.totalMs));
    const remainingRatio = this.activeGesture.remainingMs / this.activeGesture.totalMs;
    if (remainingRatio < blendOutMs / this.activeGesture.totalMs) {
      weight = Math.min(weight, remainingRatio / (blendOutMs / this.activeGesture.totalMs));
    }
    weight = easeInOut(clamp01(weight));

    driver.setGesture(this.activeGesture.id, weight);
  }
}

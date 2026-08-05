/**
 * Central tuning constants for the assistant.
 *
 * Keeping every magic number here makes the behaviour easy to tweak without
 * touching logic code, and documents the timing requirements from the spec
 * (blink 3-8s, tail 2-5s, head 6-10s, mouth 6-8 open/close per second).
 */

/** Duration of the THINKING transition before speech, in ms. 0 disables it. */
export const THINKING_DURATION_MS = 250;

/** How long it takes to blend between animation states, in ms. */
export const ANIMATION_BLEND_MS = 350;

/** Upper-body blending: keep breathing weight during speech. */
export const BREATHING_WEIGHT_IDLE = 1.0;
export const BREATHING_WEIGHT_TALKING = 0.35;

/* ---------------------------------- IDLE --------------------------------- */

/** Blink every 3–8 seconds. */
export const BLINK_INTERVAL_MIN_MS = 3000;
export const BLINK_INTERVAL_MAX_MS = 8000;
/** Time spent fully closed during one blink, in ms. */
export const BLINK_CLOSED_MS = 130;
/** Blink transition duration (closing and opening), in ms. */
export const BLINK_EASE_MS = 90;

/** Tail sway every 2–5 seconds. */
export const TAIL_INTERVAL_MIN_MS = 2000;
export const TAIL_INTERVAL_MAX_MS = 5000;
export const TAIL_SWAY_DURATION_MS = 1600;

/** Subtle head movement every 6–10 seconds. */
export const HEAD_INTERVAL_MIN_MS = 6000;
export const HEAD_INTERVAL_MAX_MS = 10000;
export const HEAD_MOVE_DURATION_MS = 2200;

/** Occasional ear twitch every 5–12 seconds (only if the rig has ear bones). */
export const EAR_INTERVAL_MIN_MS = 5000;
export const EAR_INTERVAL_MAX_MS = 12000;
export const EAR_TWITCH_DURATION_MS = 550;

/** Slow breathing cycle period, in ms. */
export const BREATH_PERIOD_MS = 4200;

/* -------------------------------- TALKING -------------------------------- */

/** Random gesture every 2–4 seconds while talking. */
export const GESTURE_INTERVAL_MIN_MS = 2000;
export const GESTURE_INTERVAL_MAX_MS = 4000;

/**
 * Mouth movements per second when no audio amplitude is available.
 * Each "movement" is one open-close cycle, so ~7 Hz.
 */
export const MOUTH_MOVEMENTS_PER_SECOND_MIN = 6;
export const MOUTH_MOVEMENTS_PER_SECOND_MAX = 8;
/** Maximum jaw opening (0..1). */
export const MOUTH_MAX_OPEN = 1.0;
/** Mouth idle micro-movement while not speaking. */
export const MOUTH_IDLE_OPEN = 0.04;

/* --------------------------------- Queue --------------------------------- */

/** Maximum number of queued messages (protects memory on spam). */
export const SPEECH_QUEUE_MAX_LENGTH = 10;

/* ----------------------------- Speech / TTS ------------------------------ */

/** Estimated characters per second used only by the fallback (non-native) TTS. */
export const FALLBACK_TTS_CHARS_PER_SECOND = 18;
/** Small delay before the fallback "starts" speaking, in ms. */
export const FALLBACK_TTS_START_DELAY_MS = 150;

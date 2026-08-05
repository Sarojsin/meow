/**
 * Shared domain types for the 3D Talking Assistant.
 *
 * These types intentionally live outside of any controller so that the
 * rendering, speech and business-logic layers only depend on stable shapes,
 * not on each other's implementations.
 */

/**
 * Finite state machine states for the assistant character.
 *
 * IDLE     – default state, looping breathing/blinking/tail/head animation.
 * THINKING – optional short transition state used before speech starts.
 * TALKING  – active speech with mouth animation and random gestures.
 */
export type AssistantState = 'IDLE' | 'THINKING' | 'TALKING';

/**
 * Visibility of the floating assistant widget.
 *
 * hidden   – not rendered at all.
 * floating – the small round assistant in the bottom-right corner.
 * expanded – the assistant panel is expanded (larger view + speech bubble).
 */
export type AssistantMode = 'hidden' | 'floating' | 'expanded';

/**
 * Application events that may trigger the assistant to speak.
 *
 * The assistant should only ever speak in response to meaningful events,
 * never on arbitrary user taps.
 */
export type AssistantEvent =
  | 'app_opened'
  | 'prediction_updated'
  | 'period_logged'
  | 'period_started'
  | 'period_ended'
  | 'ovulation'
  | 'fertile_window'
  | 'medication_reminder'
  | 'hydration_reminder'
  | 'mood_support'
  | 'achievement_unlocked'
  | 'cycle_completed'
  | 'warning'
  | 'error';

/**
 * Predefined response categories used by the RuleEngine.
 */
export type ResponseCategory =
  | 'greeting'
  | 'prediction'
  | 'period_started'
  | 'period_ended'
  | 'ovulation'
  | 'fertile_window'
  | 'medication_reminder'
  | 'hydration_reminder'
  | 'mood_support'
  | 'achievement'
  | 'warning'
  | 'error';

/**
 * Available gestures. 'listeningPose' is visual only (played while the user
 * speaks in a future version) and is never chosen randomly while talking.
 */
export type GestureId =
  | 'wave'
  | 'point'
  | 'thumbsUp'
  | 'headNod'
  | 'headTilt'
  | 'thinkingPose'
  | 'welcome'
  | 'celebrate'
  | 'listeningPose';

/** Optional TTS tuning per request. */
export interface SpeechOptions {
  /** BCP-47 language tag, e.g. 'en-US'. Defaults to the device locale. */
  language?: string;
  /** Speech rate. 1.0 is the default rate. */
  rate?: number;
  /** Speech pitch. 1.0 is the default pitch. */
  pitch?: number;
  /** Output volume, 0.0 - 1.0. */
  volume?: number;
}

/** Callbacks reported by the speech layer. */
export interface SpeechCallbacks {
  /** Fired when the native engine actually begins speaking the utterance. */
  onStart?: (requestId: string) => void;
  /** Fired when an utterance finishes (or is interrupted). */
  onDone?: (requestId: string) => void;
  /** Fired when the utterance could not be spoken. */
  onError?: (requestId: string, error?: string) => void;
}

/**
 * Read-only snapshot of the assistant UI state that React components can
 * subscribe to. All mutations go through the AssistantManager.
 */
export interface AssistantUiState {
  /** false while the assistant is hidden (long-press or hide()). */
  visible: boolean;
  /** true when the floating panel is expanded. */
  expanded: boolean;
  /** true while a message is being spoken. */
  speaking: boolean;
  /** The message currently being (or last) spoken. */
  currentText: string | null;
  /** Current FSM state of the character. */
  state: AssistantState;
}

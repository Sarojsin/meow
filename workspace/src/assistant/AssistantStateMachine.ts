import type { AssistantState } from './types';

/**
 * Finite state machine for the assistant character.
 *
 *   IDLE ──► THINKING ──► TALKING
 *    ▲                        │
 *    └────────────────────────┘
 *
 * Transitions are guarded: invalid transitions are ignored (and logged in dev)
 * instead of corrupting the machine. Consumers subscribe to state changes and
 * drive their animation accordingly.
 */

export type StateListener = (state: AssistantState, previous: AssistantState) => void;

/** Allowed transitions, expressed as `previous -> next`. */
const TRANSITIONS: Readonly<Record<AssistantState, readonly AssistantState[]>> = {
  IDLE: ['THINKING', 'TALKING'],
  THINKING: ['TALKING'],
  TALKING: ['IDLE', 'THINKING'],
};

export class AssistantStateMachine {
  private current: AssistantState = 'IDLE';
  private readonly listeners = new Set<StateListener>();

  /** Current state. */
  getState(): AssistantState {
    return this.current;
  }

  /** True while the character is talking (TALKING or THINKING). */
  isSpeaking(): boolean {
    return this.current !== 'IDLE';
  }

  /**
   * Attempts a transition. Invalid transitions are ignored so that racing
   * speech/stop calls can never put the machine into an undefined state.
   *
   * @returns true when the state actually changed.
   */
  transitionTo(next: AssistantState): boolean {
    if (next === this.current) {
      return true;
    }
    if (!TRANSITIONS[this.current].includes(next)) {
      if (__DEV__) {
        console.warn(`[assistant] ignored invalid transition ${this.current} -> ${next}`);
      }
      return false;
    }
    const previous = this.current;
    this.current = next;
    for (const listener of this.listeners) {
      listener(this.current, previous);
    }
    return true;
  }

  /** Forces a state, bypassing the transition table (used on full reset). */
  reset(next: AssistantState = 'IDLE'): void {
    const previous = this.current;
    if (next === previous) {
      return;
    }
    this.current = next;
    for (const listener of this.listeners) {
      listener(this.current, previous);
    }
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * Minimal, dependency-free observable store.
 *
 * Used by the AssistantManager to broadcast UI state to React components
 * without dragging React into the business-logic layer. Components subscribe
 * and re-render via a `useSyncExternalStore`-compatible API
 * (`subscribe` + `getSnapshot`).
 */

export type Unsubscribe = () => void;

export type StoreListener<S> = (state: S) => void;

export class Store<S> {
  private state: S;
  private readonly listeners = new Set<StoreListener<S>>();

  constructor(initialState: S) {
    this.state = initialState;
  }

  /** Returns the current immutable snapshot. */
  getState(): S {
    return this.state;
  }

  /** Immutably patches the state and notifies subscribers. */
  setState(patch: Partial<S>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  /**
   * Subscribe to state changes.
   *
   * Returns an unsubscribe function. The callback receives the full new
   * snapshot on every change.
   */
  subscribe(listener: StoreListener<S>): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

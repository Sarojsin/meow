import { AssistantStateMachine } from '../AssistantStateMachine';
import type { AssistantState } from '../types';

describe('AssistantStateMachine', () => {
  it('starts idle and transitions along the valid edges', () => {
    const fsm = new AssistantStateMachine();
    expect(fsm.getState()).toBe('IDLE');

    // IDLE -> THINKING (valid)
    expect(fsm.transitionTo('THINKING')).toBe(true);
    expect(fsm.getState()).toBe('THINKING');

    // THINKING -> TALKING (valid)
    expect(fsm.transitionTo('TALKING')).toBe(true);
    expect(fsm.getState()).toBe('TALKING');

    // TALKING -> IDLE (valid)
    expect(fsm.transitionTo('IDLE')).toBe(true);
    expect(fsm.getState()).toBe('IDLE');
  });

  it('rejects invalid transitions and stays put', () => {
    const fsm = new AssistantStateMachine();
    // THINKING -> IDLE is not a valid edge (must go TALKING first).
    fsm.transitionTo('THINKING');
    expect(fsm.transitionTo('IDLE')).toBe(false);
    expect(fsm.getState()).toBe('THINKING');
  });

  it('notifies subscribers on state change', () => {
    const fsm = new AssistantStateMachine();
    const seen: AssistantState[] = [];
    fsm.subscribe((state) => seen.push(state));

    fsm.transitionTo('THINKING');
    fsm.transitionTo('TALKING');
    fsm.transitionTo('IDLE');

    expect(seen).toEqual(['THINKING', 'TALKING', 'IDLE']);
  });

  it('exposes isSpeaking() once out of IDLE', () => {
    const fsm = new AssistantStateMachine();
    expect(fsm.isSpeaking()).toBe(false);
    fsm.transitionTo('THINKING');
    expect(fsm.isSpeaking()).toBe(true);
    fsm.transitionTo('TALKING');
    expect(fsm.isSpeaking()).toBe(true);
    fsm.transitionTo('IDLE');
    expect(fsm.isSpeaking()).toBe(false);
  });

  it('reset() moves back to IDLE', () => {
    const fsm = new AssistantStateMachine();
    fsm.transitionTo('THINKING');
    fsm.reset('IDLE');
    expect(fsm.getState()).toBe('IDLE');
  });
});

import { RuleEngine, ruleEngine } from '../RuleEngine';
import type { AssistantEvent } from '../types';

describe('RuleEngine', () => {
  it('responds to every known event with a non-empty message', () => {
    const events: AssistantEvent[] = [
      'app_opened',
      'prediction_updated',
      'period_logged',
      'period_started',
      'period_ended',
      'ovulation',
      'fertile_window',
      'medication_reminder',
      'hydration_reminder',
      'mood_support',
      'achievement_unlocked',
      'cycle_completed',
      'warning',
      'error',
    ];
    for (const event of events) {
      const response = ruleEngine.respondToEvent(event);
      expect(response).toBeTruthy();
      expect(response.trim().length).toBeGreaterThan(0);
    }
  });

  it('never repeats the same line twice in a row', () => {
    const engine = new RuleEngine();
    const first = engine.respondToEvent('period_logged');
    const second = engine.respondToEvent('period_logged');
    expect(first).not.toBe(second);
  });

  it('provides a singleton', () => {
    expect(ruleEngine).toBeInstanceOf(RuleEngine);
  });
});

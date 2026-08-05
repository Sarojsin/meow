import type { AssistantEvent, ResponseCategory } from './types';

/**
 * Rule engine for predefined, rule-based responses.
 *
 * The assistant never generates free-form text – every line it can say is
 * listed here and picked randomly. The engine tracks the last used line per
 * category so the same message is never repeated back-to-back.
 */

/** Event → category mapping. Several events can share a category. */
export const EVENT_TO_CATEGORY: Readonly<Record<AssistantEvent, ResponseCategory>> = {
  app_opened: 'greeting',
  prediction_updated: 'prediction',
  period_logged: 'prediction',
  period_started: 'period_started',
  period_ended: 'period_ended',
  ovulation: 'ovulation',
  fertile_window: 'fertile_window',
  medication_reminder: 'medication_reminder',
  hydration_reminder: 'hydration_reminder',
  mood_support: 'mood_support',
  achievement_unlocked: 'achievement',
  cycle_completed: 'achievement',
  warning: 'warning',
  error: 'error',
};

/** All predefined responses, grouped by category. */
export const RESPONSES: Readonly<Record<ResponseCategory, readonly string[]>> = {
  greeting: [
    'Hello! How can I help you today?',
    'Hi there! It is good to see you.',
    'Welcome back! I am here when you need me.',
    'Hey! Ready to track another day together?',
  ],
  prediction: [
    'Your next period is expected in three days.',
    'Based on your recent cycles, your next period may begin this week.',
    'Your cycle suggests your next period is about five days away.',
    'Looking at your history, your period may start soon.',
  ],
  period_started: [
    'Your period has started. Take care of yourself today.',
    'It looks like your period started. Make sure to rest and stay warm.',
    'Your period is here. You have got this!',
  ],
  period_ended: [
    'Your period has ended. Great job keeping track.',
    'Your period is over. Your cycle has been recorded.',
  ],
  ovulation: [
    'You are likely ovulating today.',
    'Based on your cycle, ovulation is happening around now.',
    'Today could be your ovulation day.',
  ],
  fertile_window: [
    'You are currently in your fertile window.',
    'Your fertile window is open right now.',
    'This is your fertile window, in case you wanted to know.',
  ],
  medication_reminder: [
    'Time to take your medication.',
    'Do not forget to take your medication today.',
    'This is a reminder to take your pills now.',
  ],
  hydration_reminder: [
    'Do not forget to drink some water.',
    'Time for a water break. Stay hydrated!',
    'Your body will thank you for some water right now.',
  ],
  mood_support: [
    'You are doing great. Keep going!',
    'It is okay to have tough days. Be kind to yourself.',
    'You are stronger than you think.',
    'Take a deep breath. One step at a time.',
  ],
  achievement: [
    'Congratulations on your streak!',
    'Amazing! You just unlocked a new achievement.',
    'Well done! Another cycle tracked successfully.',
    'You completed your cycle log. Wonderful consistency!',
  ],
  warning: [
    'Please check your cycle data when you have a moment.',
    'Your last log looks a little unusual. Have a look when you can.',
  ],
  error: [
    'Something went wrong. Please try again.',
    'Oops, that did not work. Mind trying once more?',
    'I could not complete that. Please try again shortly.',
  ],
};

/** All category keys, for lookup/indexing. */
export const RESPONSE_CATEGORIES: readonly ResponseCategory[] = Object.keys(
  RESPONSES,
) as ResponseCategory[];

export class RuleEngine {
  /** Last picked line index per category, to avoid immediate repeats. */
  private readonly lastIndex = new Map<ResponseCategory, number>();

  /**
   * Returns a random response for a category, never repeating the exact line
   * that was returned last time for that category.
   */
  generate(category: ResponseCategory): string {
    const pool = RESPONSES[category];
    const count = pool.length;
    const previous = this.lastIndex.get(category);

    // Pick any index except `previous`. For a pool of 1 the only option wins.
    let index: number;
    do {
      index = Math.floor(Math.random() * count);
    } while (index === previous && count > 1);

    this.lastIndex.set(category, index);
    return pool[index];
  }

  /**
   * Convenience: maps an application event to a category and returns a
   * response for it.
   */
  respondToEvent(event: AssistantEvent): string {
    return this.generate(EVENT_TO_CATEGORY[event]);
  }

  /** Number of available lines per category. */
  poolSize(category: ResponseCategory): number {
    return RESPONSES[category].length;
  }
}

/** Shared instance. */
export const ruleEngine = new RuleEngine();

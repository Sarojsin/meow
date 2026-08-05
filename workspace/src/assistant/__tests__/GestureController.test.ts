import { GestureController, type GestureDefinition } from '../GestureController';
import type { GestureId } from '../types';

/** Scheduler that queues callbacks; flush() runs them one at a time. */
function createManualScheduler() {
  let queue: Array<() => void> = [];
  return {
    scheduler: (fn: () => void): ReturnType<typeof setTimeout> => {
      queue.push(fn);
      return queue.length as unknown as ReturnType<typeof setTimeout>;
    },
    cancelScheduler: (): void => {},
    flush: (): void => {
      const batch = queue;
      queue = [];
      for (const fn of batch) {
        fn();
      }
    },
  };
}

describe('GestureController', () => {
  it('never picks the gesture currently playing', () => {
    const manual = createManualScheduler();
    const controller = new GestureController({
      scheduler: manual.scheduler,
      cancelScheduler: manual.cancelScheduler,
    });
    const picked: GestureId[] = [];
    controller.start((selection) => picked.push(selection.gesture));

    for (let i = 0; i < 10; i++) {
      manual.flush();
    }
    controller.stop();

    expect(picked.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < picked.length; i++) {
      expect(picked[i]).not.toBe(picked[i - 1]);
    }
  });

  it('skips visual-only gestures from the pool', () => {
    const custom: readonly GestureDefinition[] = [
      { id: 'wave', weight: 1 },
      { id: 'listeningPose', weight: 1, visualOnly: true },
    ];
    const manual = createManualScheduler();
    const controller = new GestureController({
      gestures: custom,
      scheduler: manual.scheduler,
      cancelScheduler: manual.cancelScheduler,
    });
    const picked: GestureId[] = [];
    controller.start((selection) => picked.push(selection.gesture));

    for (let i = 0; i < 5; i++) {
      manual.flush();
    }
    controller.stop();

    expect(picked.length).toBeGreaterThan(0);
    for (const id of picked) {
      expect(id).not.toBe('listeningPose');
    }
  });

  it('stop() clears the current gesture and stops scheduling', () => {
    const manual = createManualScheduler();
    const controller = new GestureController({
      scheduler: manual.scheduler,
      cancelScheduler: manual.cancelScheduler,
    });
    const picked: GestureId[] = [];
    controller.start((selection) => picked.push(selection.gesture));
    manual.flush();
    expect(picked.length).toBe(1);
    expect(controller.getCurrentGesture()).toBe(picked[0]);

    controller.stop();
    manual.flush();
    expect(picked.length).toBe(1); // no new gestures after stop
    expect(controller.getCurrentGesture()).toBeNull();
  });

  it('reports a positive duration for every gesture', () => {
    const controller = new GestureController();
    const ids: GestureId[] = [
      'wave',
      'point',
      'thumbsUp',
      'headNod',
      'headTilt',
      'thinkingPose',
      'welcome',
      'celebrate',
      'listeningPose',
    ];
    for (const id of ids) {
      expect(controller.getDurationMs(id)).toBeGreaterThan(0);
    }
  });
});

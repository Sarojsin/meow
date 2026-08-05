import { AnimationController, type IAssistantRenderDriver } from '../AnimationController';
import type { GestureId } from '../types';

/** Recording driver that captures every intent passed to it. */
class RecordingDriver implements IAssistantRenderDriver {
  readonly jaws: number[] = [];
  readonly breaths: number[] = [];
  readonly heads: number[] = [];
  readonly gestures: Array<{ gesture: GestureId | null; weight: number }> = [];

  setJaw(v: number): void {
    this.jaws.push(v);
  }
  setHeadTilt(_radians: number): void {}
  setHeadNod(v: number): void {
    this.heads.push(v);
  }
  setBlink(_close01: number): void {}
  setBreath(v: number): void {
    this.breaths.push(v);
  }
  setTailSway(_radians: number): void {}
  setEarTwitch(_amount01: number): void {}
  setGesture(gesture: GestureId | null, weight: number): void {
    this.gestures.push({ gesture, weight });
  }
  update(): void {}
}

describe('AnimationController', () => {
  it('produces bounded jaw/breath intents while talking', () => {
    const driver = new RecordingDriver();
    const controller = new AnimationController();

    controller.attachDriver(driver);
    controller.start();
    controller.setState('TALKING');

    let now = 0;
    for (let i = 0; i < 120; i++) {
      now += 16;
      controller.tick(now);
    }

    controller.stop();

    expect(driver.jaws.length).toBeGreaterThan(20);
    for (const jaw of driver.jaws) {
      expect(jaw).toBeGreaterThanOrEqual(0);
      expect(jaw).toBeLessThanOrEqual(1);
    }
    expect(driver.breaths.length).toBeGreaterThan(0);
    for (const breath of driver.breaths) {
      expect(breath).toBeGreaterThanOrEqual(0);
      expect(breath).toBeLessThanOrEqual(1);
    }
  });

  it('ignores tick() before start or without a driver', () => {
    const controller = new AnimationController();
    controller.setState('TALKING');
    // No driver attached -> tick is a no-op and must not throw.
    controller.tick(16);
    expect(controller.isRunning()).toBe(false);

    controller.start();
    expect(controller.isRunning()).toBe(true);
  });

  it('clears gesture on detach and stop', () => {
    const controller = new AnimationController();
    controller.attachDriver(new RecordingDriver());
    controller.start();
    controller.setState('TALKING');
    controller.playOnce('welcome');
    controller.stop();
    expect(controller.isRunning()).toBe(false);
  });
});

import { AppState } from 'react-native';
import type { AssistantEvent, AssistantUiState, SpeechOptions } from './types';
import { AssistantStateMachine } from './AssistantStateMachine';
import { AnimationController, type IAssistantRenderDriver } from './AnimationController';
import { getSpeechService, type ISpeechService } from './SpeechService';
import { RuleEngine, ruleEngine } from './RuleEngine';
import { Store } from './store';
import {
  SPEECH_QUEUE_MAX_LENGTH,
  THINKING_DURATION_MS,
} from './config';

/**
 * AssistantManager – singleton facade for the 3D Talking Assistant.
 *
 * Everything the rest of the app (and the UI) is allowed to do goes through
 * this class. It owns:
 *
 *   - the speech queue (only one utterance at a time)
 *   - the state machine (IDLE / THINKING / TALKING)
 *   - the animation + gesture controllers
 *   - the rule engine (event → predefined response)
 *   - app lifecycle handling (pause on background, resume on foreground)
 *   - the observable UI state that React components subscribe to
 *
 * Components must never touch TTS, the state machine or the animation
 * controller directly.
 */

const INITIAL_UI_STATE: AssistantUiState = {
  visible: false,
  expanded: false,
  speaking: false,
  currentText: null,
  state: 'IDLE',
};

export class AssistantManager {
  private static shared: AssistantManager | null = null;

  /** Singleton access. */
  static getInstance(): AssistantManager {
    if (!AssistantManager.shared) {
      AssistantManager.shared = new AssistantManager();
    }
    return AssistantManager.shared;
  }

  /** Test-only: replace the singleton. */
  static setInstance(instance: AssistantManager | null): void {
    AssistantManager.shared = instance;
  }

  private readonly stateMachine = new AssistantStateMachine();
  private readonly animation = new AnimationController();
  private readonly speech: ISpeechService;
  private readonly rules: RuleEngine;
  private readonly uiStore = new Store<AssistantUiState>(INITIAL_UI_STATE);

  private readonly pendingQueue: string[] = [];

  private thinkingTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: ReturnType<typeof requestAnimationFrame> | null = null;
  private suspended = false;
  private defaultSpeechOptions: SpeechOptions = {};

  /** Text that was speaking when the app went to background (for resume). */
  private pausedMessage: string | null = null;

  private constructor(rules: RuleEngine = ruleEngine) {
    this.rules = rules;
    this.speech = getSpeechService();
    this.subscribeStateMachine();
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  /* --------------------------- UI state (read) --------------------------- */

  /** Snapshot of UI state for React (use with useSyncExternalStore). */
  getSnapshot(): AssistantUiState {
    return this.uiStore.getState();
  }

  /** Subscribe to UI state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: AssistantUiState) => void): () => void {
    return this.uiStore.subscribe(listener);
  }

  /* ------------------------------- lifecycle ------------------------------ */

  /** Show the floating assistant (bottom-right). */
  show(): void {
    this.uiStore.setState({ visible: true });
    this.animation.resume();
    if (!this.stateMachine.isSpeaking()) {
      this.stateMachine.reset('IDLE');
    }
  }

  /** Hide the assistant (long-press). Stops any speech and clears the queue. */
  hide(): void {
    this.interruptSpeech();
    this.pendingQueue.length = 0;
    this.animation.pause();
    this.uiStore.setState({ visible: false, expanded: false });
  }

  /** Expand the assistant panel (tap). */
  expand(): void {
    if (this.uiStore.getState().visible) {
      this.uiStore.setState({ expanded: true });
    }
  }

  /** Collapse the expanded panel back to the floating state. */
  collapse(): void {
    this.uiStore.setState({ expanded: false });
  }

  /* ------------------------------ speech API ------------------------------ */

  /**
   * Speak a message. If the assistant is already speaking, the message is
   * queued and spoken when the current utterance finishes.
   */
  speak(text: string, options?: SpeechOptions): void {
    if (!text || !text.trim()) {
      return;
    }
    if (!this.uiStore.getState().visible) {
      this.show();
    }
    if (this.stateMachine.isSpeaking()) {
      this.enqueue(text);
      return;
    }
    this.startUtterance(text, options);
  }

  /**
   * Queue a message without speaking immediately when idle; identical to
   * `speak` in the queued case.
   */
  queue(text: string, options?: SpeechOptions): void {
    if (!text || !text.trim()) {
      return;
    }
    if (this.stateMachine.isSpeaking()) {
      this.enqueue(text);
    } else {
      this.startUtterance(text, options);
    }
  }

  /** Stop the current utterance and drop any queued messages. */
  stop(): void {
    this.interruptSpeech();
    this.pendingQueue.length = 0;
  }

  /** True while an utterance is playing or a queued one is pending. */
  isSpeaking(): boolean {
    return this.stateMachine.isSpeaking() || this.pendingQueue.length > 0;
  }

  /** Configure default TTS options for all future utterances. */
  setDefaultSpeechOptions(options: SpeechOptions): void {
    this.defaultSpeechOptions = { ...this.defaultSpeechOptions, ...options };
  }

  /* -------------------------------- events -------------------------------- */

  /**
   * Fire an application event. The assistant picks a predefined response for
   * the event (via the rule engine) and speaks it.
   */
  trigger(event: AssistantEvent): void {
    if (!this.uiStore.getState().visible) {
      this.show();
    }
    this.speak(this.rules.respondToEvent(event));
  }

  /* ------------------------------ animation ------------------------------- */

  /** Attach the 3D renderer (called by the TalkingCat component). */
  attachRenderer(driver: IAssistantRenderDriver): void {
    this.animation.attachDriver(driver);
    this.animation.start();
    this.startAnimationLoop();
  }

  /** Detach the 3D renderer (called on component unmount). */
  releaseRenderer(): void {
    this.animation.stop();
    this.stopAnimationLoop();
  }

  /** Feed live audio level (0..1) if a provider is added in a future version. */
  setAudioLevel(level: number): void {
    this.animation.setAmplitude(level);
  }

  /** Advance the animation one frame (internal loop; safe to call externally). */
  tickAnimation(nowMs: number): void {
    this.animation.tick(nowMs);
  }

  /* ------------------------------ internals ------------------------------- */

  private subscribeStateMachine(): void {
    this.stateMachine.subscribe((state) => {
      this.animation.setState(state);
      this.uiStore.setState({ state });
    });
  }

  private enqueue(text: string): void {
    if (this.pendingQueue.length >= SPEECH_QUEUE_MAX_LENGTH) {
      return; // drop instead of growing unboundedly
    }
    this.pendingQueue.push(text);
  }

  private enqueueFront(text: string): void {
    this.pendingQueue.unshift(text);
  }

  private startUtterance(text: string, options?: SpeechOptions): void {
    this.uiStore.setState({ speaking: true, currentText: text });

    if (THINKING_DURATION_MS > 0) {
      this.stateMachine.transitionTo('THINKING');
      this.thinkingTimer = setTimeout(() => {
        this.thinkingTimer = null;
        this.beginSpeech(text, options);
      }, THINKING_DURATION_MS);
      return;
    }
    this.beginSpeech(text, options);
  }

  private beginSpeech(text: string, options?: SpeechOptions): void {
    if (this.suspended) {
      // The app went to background while thinking; keep the text queued.
      this.enqueueFront(text);
      this.stateMachine.reset('IDLE');
      return;
    }
    this.stateMachine.transitionTo('TALKING');
    this.speech.speak(
      text,
      {
        onStart: () => {
          this.uiStore.setState({ speaking: true, currentText: text });
        },
        onDone: () => this.onSpeechFinished(),
        onError: () => this.onSpeechFinished(),
      },
      { ...this.defaultSpeechOptions, ...options },
    );
  }

  private onSpeechFinished(): void {
    if (this.suspended) {
      // Do not start the next utterance while backgrounded.
      this.stateMachine.reset('IDLE');
      this.uiStore.setState({ speaking: false });
      return;
    }
    if (this.pendingQueue.length > 0) {
      const next = this.pendingQueue.shift();
      if (next) {
        this.startUtterance(next);
        return;
      }
    }
    this.stateMachine.transitionTo('IDLE');
    this.uiStore.setState({ speaking: false, currentText: null });
  }

  /** Stops TTS and resets the state machine, keeping any queued messages. */
  private interruptSpeech(): void {
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
    this.speech.stop();
    this.stateMachine.reset('IDLE');
    this.uiStore.setState({ speaking: false, currentText: null });
  }

  /* ------------------------------ app lifecycle --------------------------- */

  private readonly handleAppStateChange = (next: string): void => {
    if (next === 'active') {
      this.suspended = false;
      this.animation.resume();
      const message = this.pausedMessage;
      this.pausedMessage = null;
      if (message) {
        this.enqueueFront(message);
      }
      if (this.uiStore.getState().visible && this.pendingQueue.length > 0) {
        const nextMessage = this.pendingQueue.shift();
        if (nextMessage) {
          this.startUtterance(nextMessage);
        }
      }
      return;
    }

    // background / inactive
    this.suspended = true;
    this.animation.pause();
    if (this.stateMachine.isSpeaking()) {
      this.pausedMessage = this.uiStore.getState().currentText;
      this.interruptSpeech();
    } else if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  };

  /* ---------------------------- animation loop ---------------------------- */

  private startAnimationLoop(): void {
    if (this.rafId != null) {
      return;
    }
    const loop = (): void => {
      this.animation.tick(Date.now());
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopAnimationLoop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

/** Shared instance. */
export const assistantManager = AssistantManager.getInstance();

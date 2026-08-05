import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { SpeechCallbacks, SpeechOptions } from './types';
import { FALLBACK_TTS_CHARS_PER_SECOND, FALLBACK_TTS_START_DELAY_MS } from './config';

/**
 * Speech layer abstraction.
 *
 * The rest of the app only ever talks to `ISpeechService`; the concrete
 * implementation is chosen at startup by `createSpeechService()`:
 *
 *  - Android / iOS  → `NativeSpeechService` (TextToSpeech / AVSpeechSynthesizer)
 *  - Anything else  → `FallbackSpeechService` (timing-based simulation)
 *
 * This keeps the AssistantManager decoupled from the platform and makes the
 * feature runnable in environments without a native TTS engine (e.g. web or
 * unit tests).
 */

export interface ISpeechService {
  /**
   * True when a real native TTS engine is available.
   * The fallback implementation still works, it just doesn't produce audio.
   */
  readonly isNative: boolean;

  /**
   * Speak a single utterance. Exactly one completion callback is guaranteed:
   * `onDone` on success, `onError` on failure.
   *
   * Implementations are single-shot: they speak the given text to completion
   * and then stop. Queueing is the responsibility of the AssistantManager.
   */
  speak(text: string, callbacks: SpeechCallbacks, options?: SpeechOptions): void;

  /** Immediately stops the current utterance (if any) and fires onDone. */
  stop(): void;
}

/** Events emitted by the native `SheCareTTS` module. */
interface NativeTTSModule {
  speak: (text: string, requestId: string, options: Record<string, unknown>) => void;
  stop: () => void;
  shutdown?: () => void;
}

const TTS_MODULE_NAME = 'SheCareTTS';

/** Maps a (native) module to our stable interface. */
function getNativeModule(): NativeTTSModule | null {
  const mod = NativeModules?.[TTS_MODULE_NAME];
  return typeof mod?.speak === 'function' ? (mod as NativeTTSModule) : null;
}

let nextRequestId = 0;
const createRequestId = (): string => `req_${Date.now()}_${nextRequestId++}`;

/**
 * Wraps the native TTS module (Android `TextToSpeech`, iOS
 * `AVSpeechSynthesizer`). Falls back to error reporting when the module is
 * missing at runtime even though the platform said it should exist.
 */
class NativeSpeechService implements ISpeechService {
  readonly isNative = true;

  private readonly module: NativeTTSModule;
  private readonly subscriptions: Array<{ remove(): void }> = [];

  private currentRequestId: string | null = null;
  private currentCallbacks: SpeechCallbacks = {};

  constructor(module: NativeTTSModule) {
    this.module = module;

    if (NativeEventEmitter) {
      const emitter = new NativeEventEmitter(getNativeModule() as never);

      this.subscriptions.push(
        emitter.addListener('onSpeechStart', (payload) => this.handleStart(payload)),
        emitter.addListener('onSpeechDone', (payload) => this.handleDone(payload)),
        emitter.addListener('onSpeechError', (payload) => this.handleError(payload)),
      );
    }
  }

  speak(text: string, callbacks: SpeechCallbacks, options: SpeechOptions = {}): void {
    const requestId = createRequestId();
    this.currentRequestId = requestId;
    this.currentCallbacks = callbacks;

    try {
      this.module.speak(text, requestId, {
        language: options.language ?? '',
        rate: options.rate ?? 1.0,
        pitch: options.pitch ?? 1.0,
        volume: options.volume ?? 1.0,
      });
    } catch (error) {
      // The module exists but threw (e.g. TTS engine not initialized yet).
      this.currentRequestId = null;
      callbacks.onError?.(requestId, String(error));
    }
  }

  stop(): void {
    const requestId = this.currentRequestId;
    const callbacks = this.currentCallbacks;
    this.currentRequestId = null;
    this.currentCallbacks = {};
    try {
      this.module.stop();
    } catch {
      // ignore
    }
    // The native side also fires onSpeechDone, but we already cleared state;
    // guard against double-firing by letting the handler no-op.
    requestId !== null && callbacks.onDone?.(requestId);
  }

  private handleStart(payload: { requestId: string }): void {
    if (this.currentRequestId === payload.requestId) {
      this.currentCallbacks.onStart?.(payload.requestId);
    }
  }

  private handleDone(payload: { requestId: string }): void {
    if (this.currentRequestId === payload.requestId) {
      const callbacks = this.currentCallbacks;
      this.currentRequestId = null;
      this.currentCallbacks = {};
      callbacks.onDone?.(payload.requestId);
    }
  }

  private handleError(payload: { requestId: string; error?: string }): void {
    if (this.currentRequestId === payload.requestId) {
      const callbacks = this.currentCallbacks;
      this.currentRequestId = null;
      this.currentCallbacks = {};
      callbacks.onError?.(payload.requestId, payload.error);
    }
  }

  /** Releases the native module. Safe to call multiple times. */
  shutdown(): void {
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions.length = 0;
    this.module.shutdown?.();
    this.currentRequestId = null;
    this.currentCallbacks = {};
  }
}

/**
 * Fallback used when no native module is available (web, tests, unusual
 * simulators). It simulates speech timing based on text length so the whole
 * animation/lip-sync pipeline still works end-to-end without audio.
 */
class FallbackSpeechService implements ISpeechService {
  readonly isNative = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  speak(text: string, callbacks: SpeechCallbacks, options: SpeechOptions = {}): void {
    const requestId = createRequestId();
    this.stopped = false;

    const rate = options.rate ?? 1.0;
    const durationMs =
      (text.length / (FALLBACK_TTS_CHARS_PER_SECOND * rate)) * 1000 +
      FALLBACK_TTS_START_DELAY_MS;

    const startTimer = setTimeout(() => {
      if (this.stopped) {
        return;
      }
      callbacks.onStart?.(requestId);
      this.timer = setTimeout(() => {
        if (this.stopped) {
          return;
        }
        this.timer = null;
        callbacks.onDone?.(requestId);
      }, Math.max(durationMs, 50));
    }, FALLBACK_TTS_START_DELAY_MS);

    this.timer = startTimer;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/** Lazily-created singleton so imports never trigger platform checks early. */
let instance: ISpeechService | null = null;

/** Creates the appropriate speech implementation for the current platform. */
export function createSpeechService(): ISpeechService {
  // On iOS the module is bridged differently; on Android it is a standard
  // TurboModule. Both expose the same JS API via NativeModules.
  const nativeModule = getNativeModule();
  if (nativeModule) {
    return new NativeSpeechService(nativeModule);
  }

  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    // The module should exist on mobile; if it does not, it was not linked.
    if (__DEV__) {
      console.warn(
        '[assistant] SheCareTTS native module was not found. ' +
          'Check that the native module is linked for ' + Platform.OS + '. ' +
          'Using the fallback speech driver (no audio).',
      );
    }
  }

  return new FallbackSpeechService();
}

/** Shared speech service instance (use via getSpeechService()). */
export function getSpeechService(): ISpeechService {
  if (!instance) {
    instance = createSpeechService();
  }
  return instance;
}

/** Resets the singleton (mainly for tests). */
export function __resetSpeechServiceForTests(): void {
  instance = null;
}

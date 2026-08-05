/**
 * SheCareTTS native module entry.
 *
 * The assistant reads the module directly from `NativeModules['SheCareTTS']`
 * (see src/assistant/SpeechService.ts); this file exists so the package is a
 * valid importable module and documents the contract.
 */
import { NativeModules } from 'react-native';

export const SheCareTTS = NativeModules.SheCareTTS;

export type TTSEventName = 'onSpeechStart' | 'onSpeechDone' | 'onSpeechError';

export interface TTSEventPayload {
  requestId: string;
  error?: string;
}

export const TTS_MODULE_NAME = 'SheCareTTS';

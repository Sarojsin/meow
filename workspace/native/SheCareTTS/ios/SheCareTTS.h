#import <React/RCTBridgeModule.h>

/**
 * Native TTS bridge for iOS (AVSpeechSynthesizer), used by the
 * 3D Talking Assistant. Contract:
 *  - `speak(text, requestId, options)` — single utterance, id-prefixed events.
 *  - `stop()` — interrupts the current utterance.
 *  - Events: `onSpeechStart`, `onSpeechDone`, `onSpeechError`
 *    with `{ requestId, error? }` payloads.
 */
@interface SheCareTTS : NSObject <RCTBridgeModule>
@end

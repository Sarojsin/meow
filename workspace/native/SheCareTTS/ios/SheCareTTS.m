#import "SheCareTTS.h"
#import <AVFoundation/AVFoundation.h>
#import <React/RCTEventEmitter.h>

@interface SheCareTTS () <AVSpeechSynthesizerDelegate, RCTBridgeModule>
@property(nonatomic, strong) AVSpeechSynthesizer *synthesizer;
@property(nonatomic, copy) NSString *currentRequestId;
@end

@implementation SheCareTTS

RCT_EXPORT_MODULE(SheCareTTS)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (instancetype)init {
  if (self = [super init]) {
    _synthesizer = [[AVSpeechSynthesizer alloc] init];
    _synthesizer.delegate = self;
  }
  return self;
}

RCT_EXPORT_METHOD(speak:(NSString *)text
                  requestId:(NSString *)requestId
                  options:(NSDictionary *)options) {
  AVSpeechUtterance *utterance = [[AVSpeechUtterance alloc] initWithString:text];
  NSString *language = options[@"language"];
  if ([language isKindOfClass:[NSString class]] && language.length > 0) {
    utterance.voice = [AVSpeechSynthesisVoice voiceWithLanguage:language];
  } else {
    utterance.voice = [AVSpeechSynthesisVoice voiceWithLanguage:[AVSpeechSynthesisVoice currentLanguageCode]];
  }
  NSNumber *rate = options[@"rate"];
  utterance.rate = rate ? [rate floatValue] * AVSpeechUtteranceDefaultSpeechRate : AVSpeechUtteranceDefaultSpeechRate;
  NSNumber *pitch = options[@"pitch"];
  utterance.pitchMultiplier = pitch ? [pitch floatValue] : 1.0f;
  NSNumber *volume = options[@"volume"];
  utterance.volume = volume ? [volume floatValue] : 1.0f;

  self.currentRequestId = requestId;
  [self.synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  [self.synthesizer speakUtterance:utterance];
}

RCT_EXPORT_METHOD(stop) {
  [self.synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
}

RCT_EXPORT_METHOD(shutdown) {
  [self.synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  self.synthesizer.delegate = nil;
}

/* ------------------------------ events ------------------------------ */

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"onSpeechStart", @"onSpeechDone", @"onSpeechError" ];
}

- (void)emitEvent:(NSString *)name requestId:(NSString *)requestId error:(NSString *)error {
  if (requestId.length == 0) {
    return;
  }
  NSMutableDictionary *payload = [@{ @"requestId" : requestId } mutableCopy];
  if (error) {
    payload[@"error"] = error;
  }
  [self sendEventWithName:name body:payload];
}

#pragma mark - AVSpeechSynthesizerDelegate

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer
              didStartSpeechUtterance:(AVSpeechUtterance *)utterance {
  [self emitEvent:@"onSpeechStart" requestId:self.currentRequestId error:nil];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer
 didFinishSpeechUtterance:(AVSpeechUtterance *)utterance {
  [self emitEvent:@"onSpeechDone" requestId:self.currentRequestId error:nil];
  self.currentRequestId = nil;
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer
  didCancelSpeechUtterance:(AVSpeechUtterance *)utterance {
  [self emitEvent:@"onSpeechDone" requestId:self.currentRequestId error:nil];
  self.currentRequestId = nil;
}

@end

package com.shecaretts

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * Native TTS bridge used by the 3D Talking Assistant.
 *
 * Contract (see src/assistant/SpeechService.ts):
 *  - `speak(text, requestId, options)` speaks a single utterance with the
 *    given id, flushing any previous one (queueing lives on the JS side).
 *  - `stop()` stops the current utterance.
 *  - Emits `onSpeechStart` / `onSpeechDone` / `onSpeechError` with
 *    `{ requestId, error? }` payloads.
 *
 * Uses the classic bridge module pattern, compatible with both the old and
 * new architecture (interop) in RN 0.76.
 */
class SheCareTTSModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var tts: TextToSpeech? = null
  private var ready = false

  init {
    tts = TextToSpeech(reactContext) { status ->
      ready = status == TextToSpeech.SUCCESS
    }
    tts?.setOnUtteranceProgressListener(
      object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
          emit("onSpeechStart", utteranceId)
        }

        override fun onDone(utteranceId: String?) {
          emit("onSpeechDone", utteranceId)
        }

        override fun onStop(utteranceId: String?, interrupted: Boolean) {
          // stop() never fires onDone, so report completion to keep the
          // JS state machine moving.
          emit("onSpeechDone", utteranceId)
        }

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
          emitError(utteranceId, null)
        }

        override fun onError(utteranceId: String?, errorCode: Int) {
          emitError(utteranceId, "TTS error $errorCode")
        }
      },
    )
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun speak(text: String, requestId: String, options: ReadableMap) {
    val engine = tts
    if (engine == null || !ready) {
      emitError(requestId, "TTS engine not ready")
      return
    }

    options.getString("language")?.takeIf { it.isNotEmpty() }?.let { tag ->
      engine.language = Locale.forLanguageTag(tag)
    }
    engine.setSpeechRate(options.getDouble("rate").toFloat().coerceIn(0.1f, 2.0f))
    engine.setPitch(options.getDouble("pitch").toFloat().coerceIn(0.1f, 2.0f))

    // QUEUE_FLUSH = single-shot (interrupts any current utterance).
    val result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, requestId)
    if (result == TextToSpeech.ERROR) {
      emitError(requestId, "TTS speak failed")
    }
  }

  @ReactMethod
  fun stop() {
    tts?.stop()
  }

  @ReactMethod
  fun shutdown() {
    ready = false
    tts?.shutdown()
    tts = null
  }

  /* ------------------------------ events ------------------------------ */

  private fun emit(name: String, requestId: String?) {
    if (requestId == null) return
    val payload = Arguments.createMap()
    payload.putString("requestId", requestId)
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, payload)
  }

  private fun emitError(requestId: String, error: String?) {
    if (requestId == "") return
    val payload = Arguments.createMap()
    payload.putString("requestId", requestId)
    error?.let { payload.putString("error", it) }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onSpeechError", payload)
  }

  override fun invalidate() {
    shutdown()
    super.invalidate()
  }

  companion object {
    const val NAME = "SheCareTTS"
  }
}

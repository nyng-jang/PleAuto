package com.pleauto.vehicle

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * 음성 안내. 지금은 안드로이드 기본 TTS를 쓰고,
 * 다음 단계에서 Pleos TextToSpeech SDK(ON_DEVICE 모드)로 바꾼다.
 */
class Speaker(context: Context) {
    private var ready = false
    private var pending: String? = null
    private val tts = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
        if (ready) {
            setKorean()
            pending?.let { say(it) }
            pending = null
        }
    }

    private fun setKorean() {
        tts.setLanguage(Locale.KOREAN)
    }

    fun say(text: String) {
        if (!ready) {
            pending = text
            return
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pleauto")
    }

    fun stop() {
        tts.stop()
    }

    fun release() {
        tts.shutdown()
    }
}

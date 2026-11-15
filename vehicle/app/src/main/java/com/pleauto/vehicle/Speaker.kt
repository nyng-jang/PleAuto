package com.pleauto.vehicle

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import ai.pleos.playground.tts.TextToSpeech as PleosTts
import ai.pleos.playground.tts.constant.ErrorType
import ai.pleos.playground.tts.constant.Mode
import ai.pleos.playground.tts.listener.EventListener
import ai.pleos.playground.tts.listener.OnInitializeListener
import android.speech.tts.TextToSpeech as AndroidTts
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/**
 * 음성 안내. Pleos TextToSpeech(ON_DEVICE: Client ID/Secret 불필요)를 쓰고,
 * Pleos 음성 서비스가 없거나 초기화에 실패하면 안드로이드 기본 TTS로 말한다.
 * say()의 onDone은 말이 끝난 뒤 메인 스레드에서 한 번 불린다.
 */
class Speaker(context: Context) {
    private val app = context.applicationContext
    private val main = Handler(Looper.getMainLooper())

    private var pleos: PleosTts? = null
    private var pleosReady = false
    private var fallback: AndroidTts? = null
    private var fallbackReady = false
    private var decided = false

    private var pending: Pair<String, (() -> Unit)?>? = null
    private var onDone: (() -> Unit)? = null

    private val pleosEvents = object : EventListener {
        override fun onStart() = Unit
        override fun onReady() = Unit
        override fun onDone() = finish()
        override fun onStop() = Unit
        override fun onError(errorType: ErrorType) {
            Log.w(TAG, "Pleos TTS 오류: $errorType")
            finish()
        }
        override fun onUpdatedRms(rms: Double) = Unit
    }

    init {
        try {
            val tts = PleosTts(app, Mode.ON_DEVICE)
            pleos = tts
            tts.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    main.post {
                        runCatching { tts.setLocale(Locale.KOREA) }
                        tts.addEventListener(pleosEvents)
                        pleosReady = true
                        decide()
                    }
                }
                override fun onFailure(errorType: ErrorType) {
                    main.post {
                        Log.w(TAG, "Pleos TTS 초기화 실패: $errorType → 기본 TTS 사용")
                        useFallback()
                    }
                }
            })
        } catch (e: Throwable) {
            Log.w(TAG, "Pleos TTS 없음 → 기본 TTS 사용", e)
            useFallback()
        }
        // Pleos 음성 서비스가 응답하지 않으면 3초 뒤 기본 TTS로
        main.postDelayed({ if (!pleosReady) useFallback() }, 3000)
    }

    /** Pleos TTS 사용 여부 (화면·로그 확인용) */
    val isPleos: Boolean get() = pleosReady

    fun say(text: String, onDone: (() -> Unit)? = null) {
        if (!decided) {
            pending = text to onDone
            return
        }
        this.onDone = onDone
        when {
            pleosReady -> runCatching { pleos?.speak(text, true) }.onFailure { finish() }
            fallbackReady -> fallback?.speak(text, AndroidTts.QUEUE_FLUSH, null, UTTERANCE)
            else -> finish()
        }
    }

    fun stop() {
        onDone = null
        runCatching { pleos?.stop() }
        fallback?.stop()
    }

    fun release() {
        stop()
        runCatching {
            pleos?.removeEventListener(pleosEvents)
            pleos?.release()
        }
        fallback?.shutdown()
    }

    private fun useFallback() {
        if (fallback != null) return
        fallback = AndroidTts(app) { status ->
            main.post {
                fallbackReady = status == AndroidTts.SUCCESS
                if (fallbackReady) {
                    fallback?.setLanguage(Locale.KOREAN)
                    fallback?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(id: String?) = Unit
                        override fun onDone(id: String?) = finish()
                        @Deprecated("Deprecated in Java")
                        override fun onError(id: String?) = finish()
                    })
                }
                decide()
            }
        }
    }

    private fun decide() {
        decided = true
        pending?.let { (t, cb) -> pending = null; say(t, cb) }
    }

    private fun finish() {
        main.post {
            val cb = onDone
            onDone = null
            cb?.invoke()
        }
    }

    private companion object {
        const val TAG = "Speaker"
        const val UTTERANCE = "pleauto"
    }
}

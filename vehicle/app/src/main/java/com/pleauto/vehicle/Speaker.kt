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
import ai.pleos.playground.tts.listener.OnServerConnectionListener
import android.speech.tts.TextToSpeech as AndroidTts
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/**
 * 음성 안내. Pleos TextToSpeech를 쓴다. Client ID/Secret이 있으면 HYBRID(서버 우선, 실패 시 기기 내),
 * 없으면 ON_DEVICE. Pleos 음성 서비스가 없거나 실패하면
 * 안드로이드 기본 TTS로 말한다.
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
    private var lastText: String? = null

    private val pleosEvents = object : EventListener {
        override fun onStart() = Unit
        override fun onReady() = Unit
        override fun onDone() = finish()
        override fun onStop() = Unit
        override fun onError(errorType: ErrorType) {
            Log.w(TAG, "Pleos TTS 오류: $errorType → 기본 TTS로 다시 말함")
            main.post { switchToFallback() }
        }
        override fun onUpdatedRms(rms: Double) = Unit
    }

    init {
        try {
            val tts = PleosTts(app, if (PleosKeys.enabled) Mode.HYBRID else Mode.ON_DEVICE)
            pleos = tts
            tts.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    main.post {
                        runCatching { tts.setLocale(Locale.KOREA) }
                        tts.addEventListener(pleosEvents)
                        if (!PleosKeys.enabled) {
                            pleosReady = true
                            decide()
                            return@post
                        }
                        // 서버를 쓰려면 앱 등록(onConnected) 뒤에 말한다. 실패해도 HYBRID는 기기 내 엔진으로 말한다
                        tts.registerApp(PleosKeys.clientId, PleosKeys.clientSecret, object : OnServerConnectionListener {
                            override fun onConnected() {
                                main.post { Log.i(TAG, "Pleos TTS 서버 연결"); pleosReady = true; decide() }
                            }
                            override fun onFailed(errorType: ErrorType) {
                                main.post { Log.w(TAG, "Pleos TTS 앱 등록 실패: $errorType → 기기 내 엔진"); pleosReady = true; decide() }
                            }
                        })
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
        // Pleos 음성 서비스가 응답하지 않으면 기본 TTS로 (서버 등록은 조금 더 기다린다)
        main.postDelayed({ if (!pleosReady) useFallback() }, if (PleosKeys.enabled) 8000 else 3000)
    }

    /** Pleos TTS 사용 여부 (화면·로그 확인용) */
    val isPleos: Boolean get() = pleosReady

    fun say(text: String, onDone: (() -> Unit)? = null) {
        if (!decided) {
            pending = text to onDone
            return
        }
        this.onDone = onDone
        lastText = text
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

    /** Pleos 엔진이 말하다 실패하면(에뮬레이터에 음성 모델이 없을 때 등) 이후로는 기본 TTS만 쓴다 */
    private fun switchToFallback() {
        if (!pleosReady) return
        pleosReady = false
        val text = lastText
        val cb = onDone
        onDone = null
        if (text == null) return
        if (fallbackReady) say(text, cb) else {
            decided = false
            pending = text to cb
            useFallback()
        }
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

/** Pleos 콘솔 My Project의 Client ID/Secret (vehicle/local.properties → BuildConfig). 없으면 기기 내 모드만 쓴다 */
internal object PleosKeys {
    val clientId: String = BuildConfig.PLEOS_CLIENT_ID
    val clientSecret: String = BuildConfig.PLEOS_CLIENT_SECRET
    val enabled: Boolean get() = clientId.isNotBlank() && clientSecret.isNotBlank()
}

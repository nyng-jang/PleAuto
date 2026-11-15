package com.pleauto.vehicle

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import ai.pleos.playground.stt.SpeechToText
import ai.pleos.playground.stt.constant.ErrorType
import ai.pleos.playground.stt.constant.Mode
import ai.pleos.playground.stt.listener.OnInitializeListener
import ai.pleos.playground.stt.listener.ResultListener
import java.util.Locale

/** 음성 대답 분류 */
enum class Answer { YES, NO, UNKNOWN }

/**
 * 음성 대답 듣기. Pleos SpeechToText(ON_DEVICE: Client ID/Secret 불필요).
 * 마이크는 Pleos 음성 서비스가 다루므로 앱이 RECORD_AUDIO를 요청하지 않는다.
 * 음성 서비스가 없으면 available=false 이고, 화면 버튼으로만 답한다.
 */
class Listener(context: Context) {
    private val main = Handler(Looper.getMainLooper())
    private var stt: SpeechToText? = null
    var available = false
        private set

    private var callback: ((Answer, String) -> Unit)? = null
    private var listenMs = 6000L
    private val timeout = Runnable { finish(Answer.UNKNOWN, "") }

    private val results = object : ResultListener {
        override fun onUpdated(text: String, isFinal: Boolean) {
            if (isFinal) main.post { finish(classify(text), text) }
        }
        override fun onUpdatedEpdData(start: Long, end: Long) = Unit
        override fun onStartedRecognition() {
            // 엔진이 실제로 듣기 시작한 뒤부터 시간을 잰다 (에뮬레이터는 준비가 느림)
            main.post {
                if (callback != null) {
                    main.removeCallbacks(timeout)
                    main.postDelayed(timeout, listenMs)
                }
            }
        }
        override fun onEndedRecognition() = Unit
        override fun onError(errorType: ErrorType) {
            Log.w(TAG, "Pleos STT 오류: $errorType")
            main.post {
                // 음성 모델이 없거나 권한·인증 문제면 다시 시도하지 않고 버튼으로만 답한다
                if (errorType in UNRECOVERABLE) available = false
                finish(Answer.UNKNOWN, "")
            }
        }
        override fun onReady() = Unit
        override fun onUpdatedRms(rms: Double) = Unit
    }

    init {
        try {
            val s = SpeechToText(context.applicationContext, Mode.ON_DEVICE)
            stt = s
            s.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    main.post {
                        runCatching { s.setLocale(Locale.KOREA) }
                        s.addListener(results)
                        available = true
                    }
                }
                override fun onFailure(errorType: ErrorType) {
                    Log.w(TAG, "Pleos STT 초기화 실패: $errorType → 버튼으로만 답함")
                }
            })
        } catch (e: Throwable) {
            Log.w(TAG, "Pleos STT 없음 → 버튼으로만 답함", e)
        }
    }

    /**
     * 듣기 시작한 뒤 최대 [timeoutMs] 동안 듣고 대답을 한 번 돌려준다 (메인 스레드).
     * 엔진이 듣기 시작하지 못하면 [startMs] 뒤에 UNKNOWN.
     */
    fun listen(timeoutMs: Long = 6000, startMs: Long = 15000, onAnswer: (Answer, String) -> Unit) {
        if (!available) return
        cancel()
        callback = onAnswer
        listenMs = timeoutMs
        main.postDelayed(timeout, startMs)
        runCatching { stt?.request() }.onFailure { finish(Answer.UNKNOWN, "") }
    }

    fun cancel() {
        main.removeCallbacks(timeout)
        if (callback != null) runCatching { stt?.stop() }
        callback = null
    }

    fun release() {
        cancel()
        runCatching {
            stt?.removeListener(results)
            stt?.release()
        }
    }

    private fun finish(answer: Answer, text: String) {
        main.removeCallbacks(timeout)
        val cb = callback ?: return
        callback = null
        if (answer == Answer.UNKNOWN) runCatching { stt?.stop() }
        cb(answer, text)
    }

    companion object {
        private const val TAG = "Listener"
        private val UNRECOVERABLE = setOf(ErrorType.ON_DEVICE_ENGINE_ERROR, ErrorType.UNAVAILABLE_LANGUAGE,
            ErrorType.NOT_SUPPORTED_API, ErrorType.PERMISSION_DENIED, ErrorType.UNAUTHENTICATED, ErrorType.MIC_ERROR)
        private val NO = listOf("아니", "아뇨", "다음", "건너", "싫어", "나중", "취소", "말고")
        private val YES = listOf("응", "네", "예", "좋아", "가자", "출발", "시작", "그래", "안내", "오케이")

        /** "아니"가 "응"보다 먼저: "아니 다음 거" 같은 말을 거절로 본다 */
        fun classify(text: String): Answer {
            val t = text.replace(" ", "")
            if (t.isEmpty()) return Answer.UNKNOWN
            if (NO.any { t.contains(it) }) return Answer.NO
            if (YES.any { t.contains(it) }) return Answer.YES
            return Answer.UNKNOWN
        }
    }
}

package com.pleauto.vehicle

import android.app.Application
import android.car.Car
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

/** 화면 상태. 목업 차량 13장 중 P0 흐름: 홈 → 코드 → 승인 대기 → 목록 → 제안 → 안내 → 하루 마무리 */
sealed interface Screen {
    data class Code(val input: String = "", val error: String? = null) : Screen
    data object Waiting : Screen
    data object Loading : Screen
    data class Error(val message: String) : Screen
    data object TripList : Screen
    data class Suggest(val stop: Stop) : Screen
    data class Guiding(val stop: Stop) : Screen
    data object DayEnd : Screen
}

enum class Progress { DONE, SKIPPED }

class TripViewModel(app: Application) : AndroidViewModel(app) {
    private val api = Api()
    private val prefs = app.getSharedPreferences("pleauto", Context.MODE_PRIVATE)
    private val speaker = Speaker(app)
    private val listener = Listener(app)
    val navigator: Navigator = Navigator.create(app)

    var screen by mutableStateOf<Screen>(Screen.Loading)
        private set
    var plan by mutableStateOf<Plan?>(null)
        private set
    var dayIndex by mutableStateOf(0)
        private set
    var progress by mutableStateOf(loadProgress())
        private set
    var notice by mutableStateOf<String?>(null)
    /** 주행 중이면 true: 코드 입력(키패드)을 막는다 */
    var isDriving by mutableStateOf(false)
        private set
    /** 음성 대답을 듣는 중 */
    var listening by mutableStateOf(false)
        private set
    private val driving = DrivingState(app) { isDriving = it }

    private var pollJob: Job? = null

    init {
        navigator.onArrived = { arrived() }
        navigator.onFailure = { notice = it }
        if (token() == null) screen = Screen.Code() else loadPlan()
    }

    val day: Day? get() = plan?.days?.getOrNull(dayIndex)

    /** 아직 가지 않은 다음 일정 (차로 가지 않는 일정 제외) */
    fun nextStop(): Stop? = day?.stops?.firstOrNull { it.status != PlaceStatus.EXCLUDED && progress[it.id] == null }

    // ---- 연결 ----

    fun typeDigit(d: Char) {
        if (isDriving) return
        val s = screen as? Screen.Code ?: return
        if (s.input.length < 6) screen = s.copy(input = s.input + d, error = null)
    }

    fun deleteDigit() {
        val s = screen as? Screen.Code ?: return
        screen = s.copy(input = s.input.dropLast(1), error = null)
    }

    fun submitCode() {
        if (isDriving) return
        val s = screen as? Screen.Code ?: return
        if (s.input.length != 6) return
        viewModelScope.launch {
            try {
                val requestId = api.requestPair(s.input, "내 차량")
                screen = Screen.Waiting
                pollApproval(requestId)
            } catch (e: Exception) {
                screen = Screen.Code(error = e.message ?: "연결하지 못했어요")
            }
        }
    }

    private fun pollApproval(requestId: String) {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            repeat(200) { // 1.5초 × 200 = 5분 (서버 요청 만료와 같음)
                delay(1500)
                try {
                    when (val st = api.pairStatus(requestId)) {
                        is Api.PairStatus.Approved -> {
                            prefs.edit().putString(KEY_TOKEN, st.token).apply()
                            loadPlan()
                            return@launch
                        }
                        Api.PairStatus.Rejected -> {
                            screen = Screen.Code(error = "폰에서 연결을 거절했어요")
                            return@launch
                        }
                        Api.PairStatus.Pending -> Unit
                    }
                } catch (e: Exception) {
                    screen = Screen.Code(error = e.message ?: "연결 요청이 만료됐어요")
                    return@launch
                }
            }
            screen = Screen.Code(error = "연결 요청이 만료됐어요. 폰에서 새 코드를 받아 주세요")
        }
    }

    fun cancelWaiting() {
        pollJob?.cancel()
        screen = Screen.Code()
    }

    fun disconnect() {
        val t = token()
        prefs.edit().remove(KEY_TOKEN).remove(KEY_PROGRESS).apply()
        progress = emptyMap()
        plan = null
        screen = Screen.Code()
        if (t != null) viewModelScope.launch { runCatching { api.disconnect(t) } }
    }

    // ---- 계획 ----

    fun loadPlan() {
        val t = token() ?: return run { screen = Screen.Code() }
        screen = Screen.Loading
        viewModelScope.launch {
            try {
                val p = api.plan(t)
                plan = p
                dayIndex = pickDay(p)
                screen = Screen.TripList
            } catch (e: Api.ApiException) {
                if (e.status == 401) {
                    prefs.edit().remove(KEY_TOKEN).apply()
                    screen = Screen.Code(error = e.message)
                } else {
                    screen = Screen.Error(e.message ?: "계획을 불러오지 못했어요")
                }
            } catch (e: Exception) {
                screen = Screen.Error("서버에 연결하지 못했어요 (${BuildConfig.SERVER_URL})")
            }
        }
    }

    /** 오늘 날짜의 일정, 없으면 남은 일정이 있는 첫 날 */
    private fun pickDay(p: Plan): Int {
        val today = LocalDate.now().toString()
        val byDate = p.days.indexOfFirst { it.date == today }
        if (byDate >= 0) return byDate
        val withRemaining = p.days.indexOfFirst { d ->
            d.stops.any { it.status != PlaceStatus.EXCLUDED && progress[it.id] == null }
        }
        return if (withRemaining >= 0) withRemaining else 0
    }

    fun selectDay(index: Int) {
        if (plan?.days?.indices?.contains(index) == true) dayIndex = index
    }

    // ---- 여행 중 ----

    /** 출발할 때: 다음 목적지를 말로 제안한다 */
    fun suggestNext() {
        val stop = nextStop() ?: return run { screen = Screen.DayEnd }
        screen = Screen.Suggest(stop)
        val ok = stop.status == PlaceStatus.CONFIRMED
        val question = if (ok) "다음 목적지는 ${stop.name}${josa(stop.name, "이에요", "예요")}. 안내를 시작할까요?"
            else "${stop.name}${josa(stop.name, "은", "는")} 장소를 찾지 못했어요. 건너뛸까요?"
        speaker.say(question) { listenAnswer(stop, ok) }
    }

    /** 제안을 말한 뒤 "응/아니"를 듣는다. 못 알아들으면 버튼으로 답하면 된다 */
    private fun listenAnswer(stop: Stop, ok: Boolean) {
        if ((screen as? Screen.Suggest)?.stop != stop || !listener.available) return
        listening = true
        listener.listen { answer, text ->
            listening = false
            if ((screen as? Screen.Suggest)?.stop != stop) return@listen
            Log.i(TAG, "음성 대답: \"$text\" → $answer")
            when {
                ok && answer == Answer.YES -> startGuide(stop)
                ok && answer == Answer.NO -> skip(stop)
                !ok && answer == Answer.YES -> skip(stop)
                else -> Unit
            }
        }
    }

    private fun stopListening() {
        listener.cancel()
        listening = false
    }

    fun startGuide(stop: Stop) {
        stopListening()
        speaker.stop()
        val place = stop.place ?: return
        navigator.routeTo(place)
        screen = Screen.Guiding(stop)
    }

    fun skip(stop: Stop) {
        stopListening()
        mark(stop, Progress.SKIPPED)
        suggestNext()
    }

    /** 내비 도착 이벤트 또는 시연용 "도착 처리" 버튼 */
    fun arrived() {
        val s = screen as? Screen.Guiding ?: return
        mark(s.stop, Progress.DONE)
        speaker.say("${s.stop.name}에 도착했어요.")
        screen = if (nextStop() == null) Screen.DayEnd else Screen.TripList
    }

    fun cancelGuide() {
        navigator.cancel()
        screen = Screen.TripList
    }

    fun backToList() {
        stopListening()
        speaker.stop()
        screen = Screen.TripList
    }

    fun resetProgress() {
        progress = emptyMap()
        prefs.edit().remove(KEY_PROGRESS).apply()
        screen = Screen.TripList
    }

    private fun mark(stop: Stop, p: Progress) {
        progress = progress + (stop.id to p)
        prefs.edit().putStringSet(KEY_PROGRESS, progress.map { "${it.key}=${it.value.name}" }.toSet()).apply()
    }

    private fun loadProgress(): Map<String, Progress> =
        prefs.getStringSet(KEY_PROGRESS, emptySet()).orEmpty().mapNotNull { e ->
            val (id, v) = e.split("=", limit = 2).takeIf { it.size == 2 } ?: return@mapNotNull null
            runCatching { id to Progress.valueOf(v) }.getOrNull()
        }.toMap()

    private fun token(): String? = prefs.getString(KEY_TOKEN, null)

    override fun onCleared() {
        speaker.release()
        listener.release()
        driving.release()
        navigator.release()
    }

    private companion object {
        const val TAG = "TripViewModel"
        const val KEY_TOKEN = "vehicleToken"
        const val KEY_PROGRESS = "progress"
    }
}

/**
 * 주행 중/정차 중. Pleos 주행 제한 가이드대로 CarUxRestrictionsManager를 쓴다.
 * 차량 서비스가 없으면(일반 안드로이드) 늘 정차 중으로 본다.
 */
private class DrivingState(context: Context, private val onChange: (Boolean) -> Unit) {
    private var car: Car? = null
    private var manager: CarUxRestrictionsManager? = null

    init {
        try {
            val c = Car.createCar(context.applicationContext)
            car = c
            val m = c.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
            manager = m
            onChange(m.currentCarUxRestrictions?.isRequiresDistractionOptimization == true)
            m.registerListener { r -> onChange(r.isRequiresDistractionOptimization) }
        } catch (e: Throwable) {
            Log.w("DrivingState", "차량 주행 상태를 읽을 수 없음 → 정차 중으로 처리", e)
        }
    }

    fun release() {
        runCatching { manager?.unregisterListener() }
        runCatching { car?.disconnect() }
    }
}

/** 받침이 있으면 [withFinal], 없으면 [noFinal] (한글이 아니면 받침 있음으로 본다) */
internal fun josa(word: String, withFinal: String, noFinal: String): String {
    val c = word.trim().lastOrNull() ?: return withFinal
    if (c !in '가'..'힣') return withFinal
    return if ((c - '가') % 28 == 0) noFinal else withFinal
}

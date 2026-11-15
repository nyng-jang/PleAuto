package com.pleauto.vehicle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class MainActivity : ComponentActivity() {
    private val vm: TripViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { PleosTheme { App(vm) } }
    }
}

// ---- Pleos 디자인 값 (Figma 실측: 브랜드 #5A46FA, 버튼 L 100h radius 32, Title 40 / Body 30) ----

private val Brand = Color(0xFF5A46FA)
private val BrandDark = Color(0xFF6A57FF)
private val Active = Color(0xFF02C265)
private val Alert = Color(0xFFFF8A00)

@Composable
private fun PleosTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val scheme = if (dark) {
        darkColorScheme(primary = BrandDark, onPrimary = Color.White, background = Color(0xFF1D1E21),
            surface = Color(0xFF313236), onBackground = Color.White, onSurface = Color.White)
    } else {
        lightColorScheme(primary = Brand, onPrimary = Color.White, background = Color(0xFFF7F8FA),
            surface = Color(0xFFEDEEF2), onBackground = Color(0xFF131417), onSurface = Color(0xFF131417))
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

private val Headline = 48.sp
private val Title = 36.sp
private val Body = 28.sp
private val Label = 22.sp

@Composable
private fun App(vm: TripViewModel) {
    Box(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(40.dp),
    ) {
        when (val s = vm.screen) {
            is Screen.Code -> CodeScreen(s, vm)
            Screen.Waiting -> Message("폰에서 연결을 승인해 주세요", "폰 웹의 \"연결 요청\" 창에서 승인을 누르면 계획을 불러와요.",
                secondary = "취소" to vm::cancelWaiting)
            Screen.Loading -> Message("계획을 불러오는 중이에요", "")
            is Screen.Error -> Message("계획을 불러오지 못했어요", s.message, primary = "다시 시도" to vm::loadPlan,
                secondary = "연결 해제" to vm::disconnect)
            Screen.TripList -> TripListScreen(vm)
            is Screen.Suggest -> SuggestScreen(s.stop, vm)
            is Screen.Guiding -> GuidingScreen(s.stop, vm)
            Screen.DayEnd -> Message("오늘 일정을 모두 마쳤어요", "수고하셨어요. 내일 일정은 목록에서 날짜를 바꿔 확인할 수 있어요.",
                primary = "목록 보기" to vm::backToList)
        }
        vm.notice?.let { msg ->
            Box(Modifier.align(Alignment.BottomCenter).widthIn(max = 792.dp)
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(24.dp)).padding(24.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(msg, fontSize = Body, modifier = Modifier.weight(1f))
                    BigButton("닫기", filled = false) { vm.notice = null }
                }
            }
        }
    }
}

// ---- 공통 ----

@Composable
private fun BigButton(text: String, filled: Boolean = true, modifier: Modifier = Modifier, enabled: Boolean = true,
                      onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(100.dp),
        shape = RoundedCornerShape(32.dp),
        colors = if (filled) ButtonDefaults.buttonColors()
        else ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface),
    ) {
        Text(text, fontSize = Title, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 24.dp))
    }
}

@Composable
private fun Message(
    title: String,
    body: String,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, fontSize = Headline, fontWeight = FontWeight.Bold)
        if (body.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Text(body, fontSize = Body, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.64f))
        }
        Spacer(Modifier.height(48.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            primary?.let { (t, f) -> BigButton(t, onClick = f) }
            secondary?.let { (t, f) -> BigButton(t, filled = false, onClick = f) }
        }
    }
}

// ---- 코드 입력 (정차 중) : 키보드 대신 큰 숫자 버튼 ----

@Composable
private fun CodeScreen(s: Screen.Code, vm: TripViewModel) {
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(80.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("폰과 연결해요", fontSize = Headline, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(16.dp))
            Text(if (vm.isDriving) "주행 중에는 입력할 수 없어요. 정차한 뒤 입력해 주세요."
                else "폰 웹의 \"차량과 연결\"에서 받은 6자리 숫자를 입력해 주세요.", fontSize = Body,
                color = if (vm.isDriving) Alert else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.64f))
            Spacer(Modifier.height(40.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                for (i in 0 until 6) {
                    Box(Modifier.size(88.dp, 112.dp).background(MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp)),
                        contentAlignment = Alignment.Center) {
                        Text(s.input.getOrNull(i)?.toString() ?: "", fontSize = Headline, fontWeight = FontWeight.Bold)
                    }
                }
            }
            s.error?.let {
                Spacer(Modifier.height(24.dp))
                Text(it, fontSize = Body, color = Alert)
            }
            Spacer(Modifier.height(40.dp))
            BigButton("연결하기", modifier = Modifier.width(360.dp), enabled = !vm.isDriving, onClick = vm::submitCode)
        }
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            listOf("123", "456", "789", "<0").forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    row.forEach { c ->
                        val label = if (c == '<') "지움" else c.toString()
                        BigButton(label, filled = false, modifier = Modifier.width(160.dp), enabled = !vm.isDriving) {
                            if (c == '<') vm.deleteDigit() else vm.typeDigit(c)
                        }
                    }
                }
            }
        }
    }
}

// ---- 오늘 일정 목록 ----

@Composable
private fun TripListScreen(vm: TripViewModel) {
    val plan = vm.plan ?: return
    val day = vm.day
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(plan.title.ifBlank { "여행 일정" }, fontSize = Title, fontWeight = FontWeight.Bold)
                Text(day?.let { "${it.dayIndex}일차 · ${it.date}" } ?: "", fontSize = Body,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.64f))
            }
            if (vm.dayIndex > 0) BigButton("이전 날", filled = false) { vm.selectDay(vm.dayIndex - 1) }
            Spacer(Modifier.width(16.dp))
            if (vm.dayIndex < plan.days.lastIndex) BigButton("다음 날", filled = false) { vm.selectDay(vm.dayIndex + 1) }
        }
        Spacer(Modifier.height(24.dp))
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(day?.stops.orEmpty(), key = { it.id }) { stop -> StopRow(stop, vm.progress[stop.id], stop.id == vm.nextStop()?.id) }
        }
        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            BigButton(if (vm.nextStop() != null) "다음 목적지 안내" else "일정 끝", modifier = Modifier.weight(1f), onClick = vm::suggestNext)
            BigButton("새로 불러오기", filled = false, onClick = vm::loadPlan)
            BigButton("처음부터", filled = false, onClick = vm::resetProgress)
            BigButton("연결 해제", filled = false, onClick = vm::disconnect)
        }
    }
}

@Composable
private fun StopRow(stop: Stop, p: Progress?, isNext: Boolean) {
    val dim = p != null || stop.status == PlaceStatus.EXCLUDED
    Row(
        Modifier.fillMaxWidth()
            .background(if (isNext) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface,
                RoundedCornerShape(24.dp))
            .padding(horizontal = 32.dp, vertical = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(56.dp).background(if (isNext) MaterialTheme.colorScheme.primary else Color.Gray.copy(alpha = 0.3f), CircleShape),
            contentAlignment = Alignment.Center) {
            Text("${stop.order}", fontSize = Label, color = Color.White, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(24.dp))
        Column(Modifier.weight(1f)) {
            Text(stop.name, fontSize = Body, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = if (dim) 0.5f else 1f))
            val sub = listOf(stop.time, stop.place?.address.orEmpty()).filter { it.isNotBlank() }.joinToString(" · ")
            if (sub.isNotBlank()) Text(sub, fontSize = Label, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.64f))
        }
        val (tag, color) = when {
            p == Progress.DONE -> "도착" to Active
            p == Progress.SKIPPED -> "건너뜀" to Color.Gray
            stop.status == PlaceStatus.EXCLUDED -> "차 안 씀" to Color.Gray
            stop.status == PlaceStatus.UNRESOLVED -> "장소 미확인" to Alert
            isNext -> "다음" to MaterialTheme.colorScheme.primary
            else -> "" to Color.Transparent
        }
        if (tag.isNotEmpty()) Text(tag, fontSize = Label, color = color, fontWeight = FontWeight.Bold)
    }
}

// ---- 목적지 제안 : 결정 1개, 2줄, 큰 버튼 3개 ----

@Composable
private fun SuggestScreen(stop: Stop, vm: TripViewModel) {
    val ok = stop.status == PlaceStatus.CONFIRMED
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        Text(if (ok) "다음 목적지" else "장소를 찾지 못했어요", fontSize = Title,
            color = if (ok) MaterialTheme.colorScheme.primary else Alert, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))
        Text(stop.name, fontSize = 64.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(if (ok) listOf(stop.time, stop.place?.address.orEmpty()).filter { it.isNotBlank() }.joinToString(" · ")
            else "폰에서 장소를 지정하면 안내할 수 있어요", fontSize = Body,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.64f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(24.dp))
        // 음성으로 답할 수 있을 때: 말이 끝나면 몇 초 동안 듣는다
        Text(if (vm.listening) "듣고 있어요 · \"응\" 또는 \"아니\"라고 말해 주세요" else " ", fontSize = Body,
            color = Active, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(40.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            if (ok) BigButton("안내 시작", modifier = Modifier.weight(1f)) { vm.startGuide(stop) }
            BigButton("건너뛰기", filled = !ok, modifier = Modifier.weight(1f)) { vm.skip(stop) }
            BigButton("목록", filled = false, modifier = Modifier.weight(1f), onClick = vm::backToList)
        }
    }
}

// ---- 내비 안내 중 ----

@Composable
private fun GuidingScreen(stop: Stop, vm: TripViewModel) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
        Text(if (vm.navigator.isReal) "내비로 안내 중이에요" else "안내 중 (시연 모드)", fontSize = Title,
            color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))
        Text(stop.name, fontSize = 64.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("도착하면 다음 일정을 알려 드릴게요", fontSize = Body, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.64f))
        Spacer(Modifier.height(64.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            // 시연·에뮬레이터용: 내비 도착 이벤트 없이도 다음 단계로 간다
            BigButton("도착 처리", modifier = Modifier.weight(1f), onClick = vm::arrived)
            BigButton("안내 취소", filled = false, modifier = Modifier.weight(1f), onClick = vm::cancelGuide)
        }
    }
}

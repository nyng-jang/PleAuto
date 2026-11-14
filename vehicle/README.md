# 다음 목적지 · 차량 앱

Pleos Connect(Android Automotive)용 Kotlin 앱입니다. 폰 웹에서 받은 6자리 코드로 연결하고, 오늘 일정 순서대로 다음 목적지를 제안해 차량 내비로 안내를 요청합니다.

## 준비

1. Android Studio 최신 버전, JDK 17
2. Pleos Connect 에뮬레이터 v2.1.0
   - Tools > SDK Manager > SDK Update Sites에서 `+`
     - 이름: `Pleos Connect System Image`
     - Windows/Linux: `https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml`
     - Mac: `https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-arm64-sys-img.xml`
   - SDK Platforms에서 API 34의 Pleos Connect 이미지를 설치하고 Android Studio를 재시작
   - Device Manager > Create device > Automotive > `Pleos Connect v2.1.0`, 부팅 옵션 **Cold boot**, RAM 4GB
3. 폰 웹 서버: 저장소 루트에서 `cd web && npm install && npm run dev`

## 실행

1. Android Studio에서 `vehicle/` 폴더를 엽니다. Gradle 동기화가 끝날 때까지 기다립니다.
2. 에뮬레이터를 켜고 `app`을 실행합니다.
3. 폰 웹(`http://localhost:3000`)에서 계획을 만들고 "차량과 연결"에서 받은 6자리 코드를 차량 앱에 입력합니다.
4. 폰에서 승인하면 오늘 일정이 뜹니다. "다음 목적지 안내"를 누르면 음성으로 제안하고, "안내 시작"을 누르면 내비에 경로를 요청합니다.

서버 주소는 기본값이 `http://10.0.2.2:3000`(에뮬레이터에서 본 PC의 localhost)입니다. 배포 서버를 쓰려면 `vehicle/local.properties`에 아래 줄을 넣습니다.

```
pleauto.serverUrl=https://배포주소
```

## release APK

```bash
cd vehicle
./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk → ../apk/팀명_앱이름_release.apk 로 복사
```

서명 키가 정해지기 전까지 release 빌드는 debug 키로 서명합니다.

## 구조

| 파일 | 역할 |
|---|---|
| `Api.kt` | 폰 웹 서버의 `/api/vehicle/*` 호출 (연결 요청, 승인 확인, 계획 조회, 연결 해제) |
| `Plan.kt` | 계획 데이터 |
| `TripViewModel.kt` | 화면 상태와 흐름 (코드 → 승인 대기 → 목록 → 제안 → 안내 → 하루 마무리), 진행 상황 저장 |
| `Navigator.kt` | Pleos NaviHelper 3.0.5 연동. 내비 서비스가 없으면 시연 모드(`FakeNavigator`)로 동작 |
| `Speaker.kt` | 음성 안내 (지금은 안드로이드 기본 TTS, 다음 단계에서 Pleos TextToSpeech로 교체) |
| `MainActivity.kt` | Compose 화면. Pleos 디자인 값(브랜드 #5A46FA, 버튼 100h·radius 32) |

## 알려진 한계 (다음 단계)

- 음성 응답(STT) 대신 버튼으로 답합니다. Pleos SpeechToText 연동 예정.
- 주행 중/정차 중 구분(Vehicle SDK)은 아직 없습니다. 코드 입력은 정차 중에만 받도록 바꿀 예정.
- "도착 처리" 버튼은 에뮬레이터 시연용입니다. 실제 차량에서는 내비 도착 이벤트로 넘어갑니다.

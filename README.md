# PleAuto · 다음 목적지

폰 메모로 적은 여행 계획을 붙여 넣으면 일정표로 정리하고, 차량(Pleos Connect)에서 일정 순서대로 다음 목적지를 안내하는 앱입니다.

## 구성

| 폴더 | 내용 |
|---|---|
| `web/` | 폰 웹 (Next.js 15). 계획 해석, 장소 확정, 6자리 코드로 차량 연결, 차량 앱용 API |
| `vehicle/` | 차량 앱 (Kotlin, Android Automotive, Pleos Connect SDK). 제작 중 |
| `apk/` | 차량 앱 release APK (`팀명_앱이름_release.apk`) |

## 실행 방법

### 폰 웹

```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

API 키 없이도 시연 모드(규칙 기반 해석, 가짜 지도 후보, 메모리 저장)로 동작합니다. 환경변수는 [`web/README.md`](web/README.md)를 참고하세요.

### 차량 앱

Android Studio에서 `vehicle/`을 열고 Pleos Connect 에뮬레이터에서 실행합니다. 자세한 내용은 `vehicle/README.md`를 참고하세요.

## 테스트 환경

- Pleos Connect 에뮬레이터 v2.1.0 (Android 14, API 34, Automotive)
- 화면 규격: Connect-S 2560x1440
- Pleos Connect SDK: NaviHelper 3.0.5

## APK

`apk/` 폴더에 올릴 예정입니다.

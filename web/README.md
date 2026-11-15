# 다음 목적지 · 폰 웹

여행 계획 붙여넣기 → AI 일정표 → 장소 확정 → 6자리 코드로 차량 연결까지 하는 폰 웹과, 차량 앱이 쓰는 API입니다.

## 실행

```bash
npm install
npm run dev   # http://localhost:3000 (폰 웹), /car (차량 연결 시험 화면)
```

API 키가 하나도 없어도 돌아갑니다. 이때는 규칙 기반 해석, 가짜 지도 후보, 메모리 저장소를 써요(서버를 끄면 데이터가 사라져요).

## 환경변수 (`.env.local` 또는 Vercel 프로젝트 설정)

| 이름 | 용도 | 없을 때 |
|---|---|---|
| `GEMINI_API_KEY` | 계획 해석 (Google AI Studio에서 발급) | 규칙 기반 해석 |
| `GEMINI_MODEL` | 기본 `gemini-2.5-flash` | |
| `KAKAO_REST_API_KEY` | 카카오 로컬 키워드 검색 (REST API 키) | 시연용 가짜 후보 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | 저장소 (Vercel Marketplace로 연결하면 `KV_REST_API_*`로 들어와도 인식) | 메모리 저장 |

## 차량 앱용 API

| 메서드·경로 | 설명 |
|---|---|
| `POST /api/vehicle/pair` `{code, vehicleName}` | 6자리 코드로 연결 요청 → `{requestId}`. 코드는 한 번 쓰면 사라짐 |
| `GET /api/vehicle/pair/{requestId}` | `pending` / `rejected` / `approved` + `vehicleToken` (한 번만 내려줌) |
| `GET /api/vehicle/plan` (`Authorization: Bearer <vehicleToken>`) | 계획 조회. 각 일정에 `placeStatus`: `confirmed` / `unresolved` / `excluded` |
| `DELETE /api/vehicle/connection` (Bearer) | 연결 해제 |

## 저장소 키 (Redis)

`plan:{phoneId}` 계획, `code:{6자리}` 3분 TTL, `req:{id}` 연결 요청 5분 TTL, `conn:{token}` 승인된 차량, `phoneconns:{phoneId}` 폰의 차량 목록.

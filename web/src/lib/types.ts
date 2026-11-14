// 폰 웹과 차량 앱이 함께 쓰는 여행 계획 데이터 형식

export type Place = {
  id: string; // 카카오 장소 id
  name: string;
  address: string;
  lat: number;
  lng: number;
};

/** confirmed: 좌표 확정, unresolved: 미확인(차량에서 해당 차례에 처리) */
export type PlaceStatus = "confirmed" | "unresolved";

export type Stop = {
  id: string;
  name: string;
  time: string; // "HH:MM" 또는 ""
  memo: string;
  byCar: boolean; // false면 안내 대상에서 제외
  place?: Place;
  candidates?: Place[];
  placeStatus?: PlaceStatus;
};

export type DayStatus = "pending" | "parsing" | "done" | "failed";

export type Day = {
  dayIndex: number; // 1부터
  date: string; // "YYYY-MM-DD"
  label: string; // 원문 날짜 표기 (예: "1일차")
  text: string; // 이 날짜의 원문 구간
  region: string; // LLM이 추정한 여행 지역 (지도 검색 정확도용)
  status: DayStatus;
  error?: string;
  stops: Stop[];
};

export type Plan = {
  title: string;
  startDate: string;
  days: Day[];
  updatedAt: number;
};

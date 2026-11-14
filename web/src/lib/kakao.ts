// 카카오 로컬 키워드 검색. KAKAO_REST_API_KEY가 없으면 시연용 가짜 후보를 돌려준다.
import type { Place } from "./types";

type KakaoDoc = {
  id: string;
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
};

async function kakaoSearch(query: string, key: string): Promise<Place[]> {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "5");
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`카카오 검색 오류 ${res.status}`);
  const data = (await res.json()) as { documents: KakaoDoc[] };
  return data.documents.map((d) => ({
    id: d.id,
    name: d.place_name,
    address: d.road_address_name || d.address_name,
    lat: Number(d.y),
    lng: Number(d.x),
  }));
}

function mockSearch(query: string): Place[] {
  if (/모름|미정|어딘가|\?/.test(query)) return [];
  let h = 0;
  for (const c of query) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return [0, 1, 2].map((i) => ({
    id: `mock-${h}-${i}`,
    name: i === 0 ? query.split(" ").pop()! : `${query.split(" ").pop()} ${["2호점", "주차장"][i - 1]}`,
    address: `(시연용 가짜 주소) ${query} ${i + 1}`,
    lat: 36.35 + ((h % 1000) / 10000) + i * 0.002,
    lng: 127.38 + (((h >> 10) % 1000) / 10000) + i * 0.002,
  }));
}

/** 지역을 붙여 먼저 찾고, 없으면 장소명만으로 다시 찾는다 */
export async function searchPlace(name: string, region: string): Promise<Place[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  const search = key ? (q: string) => kakaoSearch(q, key) : async (q: string) => mockSearch(q);
  if (region) {
    const withRegion = await search(`${region} ${name}`);
    if (withRegion.length) return withRegion;
  }
  return search(name);
}

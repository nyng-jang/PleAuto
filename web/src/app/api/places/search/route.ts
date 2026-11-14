// 장소명 하나를 지도에서 찾는다 (지도 호출 1건 = 장소 1개)
import { searchPlace } from "@/lib/kakao";
import { fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const { name, region } = (await req.json().catch(() => ({}))) as { name?: string; region?: string };
  if (!name?.trim()) return fail("장소명이 비어 있어요");
  try {
    return json({ candidates: await searchPlace(name.trim(), (region ?? "").trim()) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "검색 실패", 502);
  }
}

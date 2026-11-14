// 날짜 구간 하나를 해석한다 (외부 AI 호출 1건 = 날짜 1개)
import { parseDay } from "@/lib/gemini";
import { fail, json } from "@/lib/http";

export async function POST(req: Request) {
  const { text, context } = (await req.json().catch(() => ({}))) as { text?: string; context?: string };
  if (!text?.trim()) return fail("빈 구간은 해석하지 않아요");
  try {
    return json(await parseDay(text, (context ?? "").slice(0, 100)));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "해석 실패", 502);
  }
}

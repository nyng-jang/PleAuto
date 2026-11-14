// 차량: 폰 승인 대기 상태 조회. 승인되면 연결 토큰을 한 번만 내려준다.
import { fail, json } from "@/lib/http";
import { keys, type PairRequest, store } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = store();
  const request = await s.get<PairRequest>(keys.request(id));
  if (!request) return fail("요청이 만료됐어요. 새 코드로 다시 연결해 주세요", 404);
  if (request.status === "pending") return json({ status: "pending" });
  await s.del(keys.request(id)); // 연결이 끝나면 요청 기록은 지운다
  if (request.status === "rejected") return json({ status: "rejected" });
  return json({ status: "approved", vehicleToken: request.vehicleToken });
}

// 차량: 6자리 코드로 연결 요청 (코드는 한 번 쓰면 사라진다)
import { fail, json } from "@/lib/http";
import { newId } from "@/lib/id";
import { keys, type PairRequest, store } from "@/lib/store";

export async function POST(req: Request) {
  const { code, vehicleName } = (await req.json().catch(() => ({}))) as { code?: string; vehicleName?: string };
  if (!code || !/^\d{6}$/.test(code)) return fail("숫자 6자리 코드를 입력해 주세요");
  const s = store();
  const entry = await s.take<{ phoneId: string }>(keys.code(code));
  if (!entry) return fail("코드가 맞지 않거나 만료됐어요. 폰에서 새 코드를 받아 주세요", 404);
  await s.del(keys.phoneCode(entry.phoneId));

  const request: PairRequest = {
    id: newId(16),
    phoneId: entry.phoneId,
    vehicleName: (vehicleName ?? "내 차량").slice(0, 30),
    status: "pending",
    createdAt: Date.now(),
  };
  await s.set(keys.request(request.id), request, 300); // 폰 승인은 5분 안에
  await s.set(keys.phoneRequest(entry.phoneId), request.id, 300);
  return json({ requestId: request.id });
}

// 폰: 들어온 차량 연결 요청 확인(GET)과 승인·거절(POST)
import { fail, json, validPhoneId } from "@/lib/http";
import { newId } from "@/lib/id";
import { type Connection, keys, type PairRequest, store } from "@/lib/store";

export async function GET(req: Request) {
  const phoneId = new URL(req.url).searchParams.get("phoneId");
  if (!validPhoneId(phoneId)) return fail("phoneId가 올바르지 않아요");
  const s = store();
  const reqId = await s.get<string>(keys.phoneRequest(phoneId));
  const request = reqId ? await s.get<PairRequest>(keys.request(reqId)) : null;
  return json({ request: request?.status === "pending" ? { id: request.id, vehicleName: request.vehicleName } : null });
}

export async function POST(req: Request) {
  const { phoneId, requestId, approve } = (await req.json().catch(() => ({}))) as {
    phoneId?: string;
    requestId?: string;
    approve?: boolean;
  };
  if (!validPhoneId(phoneId) || !requestId) return fail("요청이 올바르지 않아요");
  const s = store();
  const request = await s.get<PairRequest>(keys.request(requestId));
  if (!request || request.phoneId !== phoneId || request.status !== "pending") return fail("연결 요청이 없거나 만료됐어요", 404);

  await s.del(keys.phoneRequest(phoneId));
  if (!approve) {
    await s.set(keys.request(requestId), { ...request, status: "rejected" }, 120);
    return json({ ok: true, status: "rejected" });
  }
  const token = newId(24);
  const conn: Connection = { token, phoneId, vehicleName: request.vehicleName, createdAt: Date.now() };
  await s.set(keys.conn(token), conn);
  await s.sadd(keys.phoneConns(phoneId), token);
  // 차량이 한 번 받아 가면 요청 기록은 지운다 (vehicle/pair/[id])
  await s.set(keys.request(requestId), { ...request, status: "approved", vehicleToken: token }, 120);
  return json({ ok: true, status: "approved" });
}

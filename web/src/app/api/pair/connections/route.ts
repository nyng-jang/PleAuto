// 폰: 승인된 차량 목록(GET)과 연결 해제(DELETE)
import { fail, json, validPhoneId } from "@/lib/http";
import { type Connection, keys, store } from "@/lib/store";

export async function GET(req: Request) {
  const phoneId = new URL(req.url).searchParams.get("phoneId");
  if (!validPhoneId(phoneId)) return fail("phoneId가 올바르지 않아요");
  const s = store();
  const tokens = await s.smembers(keys.phoneConns(phoneId));
  const conns = (await Promise.all(tokens.map((t) => s.get<Connection>(keys.conn(t))))).filter(Boolean) as Connection[];
  // 폰에는 토큰 전체를 보여주지 않고 앞 8자리만 식별용으로 준다
  return json({ connections: conns.map((c) => ({ id: c.token.slice(0, 8), vehicleName: c.vehicleName, createdAt: c.createdAt })) });
}

export async function DELETE(req: Request) {
  const { phoneId, id } = (await req.json().catch(() => ({}))) as { phoneId?: string; id?: string };
  if (!validPhoneId(phoneId) || !id) return fail("요청이 올바르지 않아요");
  const s = store();
  const token = (await s.smembers(keys.phoneConns(phoneId))).find((t) => t.startsWith(id));
  if (!token) return fail("연결이 없어요", 404);
  await s.del(keys.conn(token));
  await s.srem(keys.phoneConns(phoneId), token);
  return json({ ok: true });
}

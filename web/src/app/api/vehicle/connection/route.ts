// 차량: 정차 중 연결 해제
import { bearer, fail, json } from "@/lib/http";
import { type Connection, keys, store } from "@/lib/store";

export async function DELETE(req: Request) {
  const token = bearer(req);
  if (!token) return fail("연결 토큰이 필요해요", 401);
  const s = store();
  const conn = await s.get<Connection>(keys.conn(token));
  if (conn) {
    await s.del(keys.conn(token));
    await s.srem(keys.phoneConns(conn.phoneId), token);
  }
  return json({ ok: true });
}

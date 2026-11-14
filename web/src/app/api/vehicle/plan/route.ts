// 차량: 승인된 연결로 계획 불러오기 (조회 전용)
import { bearer, fail, json } from "@/lib/http";
import { type Connection, keys, store } from "@/lib/store";
import type { Plan } from "@/lib/types";

export async function GET(req: Request) {
  const token = bearer(req);
  if (!token) return fail("연결 토큰이 필요해요", 401);
  const s = store();
  const conn = await s.get<Connection>(keys.conn(token));
  if (!conn) return fail("연결이 해제됐어요. 새 코드로 다시 연결해 주세요", 401);
  const plan = await s.get<Plan>(keys.plan(conn.phoneId));
  if (!plan) return fail("폰에 저장된 계획이 없어요", 404);

  // 차량에는 안내에 필요한 값만 보낸다 (원문·후보 목록 제외)
  return json({
    title: plan.title,
    updatedAt: plan.updatedAt,
    days: plan.days.map((d) => ({
      dayIndex: d.dayIndex,
      date: d.date,
      stops: d.stops.map((st, i) => ({
        id: st.id,
        order: i + 1,
        name: st.name,
        time: st.time,
        memo: st.memo,
        byCar: st.byCar,
        placeStatus: st.byCar ? (st.place ? "confirmed" : "unresolved") : "excluded",
        place: st.place ? { name: st.place.name, address: st.place.address, lat: st.place.lat, lng: st.place.lng } : null,
      })),
    })),
  });
}

// 폰의 확정 계획 저장/조회
import { fail, json, validPhoneId } from "@/lib/http";
import { keys, store } from "@/lib/store";
import type { Plan } from "@/lib/types";

export async function GET(req: Request) {
  const phoneId = new URL(req.url).searchParams.get("phoneId");
  if (!validPhoneId(phoneId)) return fail("phoneId가 올바르지 않아요");
  return json({ plan: await store().get<Plan>(keys.plan(phoneId)) });
}

export async function PUT(req: Request) {
  const { phoneId, plan } = (await req.json().catch(() => ({}))) as { phoneId?: string; plan?: Plan };
  if (!validPhoneId(phoneId)) return fail("phoneId가 올바르지 않아요");
  if (!plan?.days?.length) return fail("계획이 비어 있어요");
  const saved: Plan = { ...plan, updatedAt: Date.now() };
  await store().set(keys.plan(phoneId), saved);
  return json({ ok: true, updatedAt: saved.updatedAt });
}

// 일회용 숫자 6자리 연결 코드 발급 (1분 유효)
import { fail, json, validPhoneId } from "@/lib/http";
import { keys, store } from "@/lib/store";

const CODE_TTL_SEC = 60;

export async function POST(req: Request) {
  const { phoneId } = (await req.json().catch(() => ({}))) as { phoneId?: string };
  if (!validPhoneId(phoneId)) return fail("phoneId가 올바르지 않아요");
  const s = store();
  if (!(await s.get(keys.plan(phoneId)))) return fail("먼저 계획을 저장해 주세요", 409);

  // 이전에 발급한 코드는 무효로 만든다
  const prev = await s.get<string>(keys.phoneCode(phoneId));
  if (prev) await s.del(keys.code(prev));

  for (let i = 0; i < 20; i++) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    // 중복 코드면 다른 코드를 뽑는다
    if (await s.setIfAbsent(keys.code(code), { phoneId }, CODE_TTL_SEC)) {
      await s.set(keys.phoneCode(phoneId), code, CODE_TTL_SEC);
      return json({ code, expiresAt: Date.now() + CODE_TTL_SEC * 1000 });
    }
  }
  return fail("코드를 만들지 못했어요. 다시 시도해 주세요", 503);
}

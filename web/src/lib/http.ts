import { NextResponse } from "next/server";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function validPhoneId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{32}$/.test(id);
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+([a-f0-9]{48})$/);
  return m ? m[1] : null;
}

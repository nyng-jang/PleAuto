"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { needsStartDate, resolveDates, splitPlan } from "@/lib/split";
import type { Day, Place, Plan, Stop } from "@/lib/types";

type Step = "input" | "schedule" | "places" | "share";
const STEP_NAMES: [Step, string][] = [
  ["input", "계획 입력"],
  ["schedule", "일정표 확인"],
  ["places", "장소 확정"],
  ["share", "차량 연결"],
];

const DRAFT_KEY = "nd.draft.v1";
const PHONE_KEY = "nd.phoneId";
const CONSENT_KEY = "nd.aiConsent";

type Draft = { step: Step; title: string; text: string; startDate: string; days: Day[] };
const EMPTY: Draft = { step: "input", title: "", text: "", startDate: "", days: [] };

const SAMPLE = `대전 1박 2일
1일차
- 10:00 대전역 출발
- 12:00 성심당 본점 점심 (13시 예약, 주차는 뒷골목)
- 근처 으능정이 거리 산책
- 15:00 대전시립미술관
- 18:00 숙소 체크인 후 휴식
2일차
- 10:00 장태산 자연휴양림
- 13:00 한밭수목원
- 16:00 대전역`;

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경(시크릿 창 등)은 무시 */
  }
}
function getPhoneId(): string {
  let id = ls<string>(PHONE_KEY, "");
  if (!/^[a-f0-9]{32}$/.test(id)) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    lsSet(PHONE_KEY, id);
  }
  return id;
}
const uid = () => Math.random().toString(36).slice(2, 10);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
  return data as T;
}

function fmtDate(date: string) {
  const d = new Date(date + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()} (${"일월화수목금토"[d.getDay()]})`;
}

/** 동시에 n개까지만 실행 */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

export default function Home() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [phoneId, setPhoneId] = useState("");

  useEffect(() => {
    setDraft(ls<Draft>(DRAFT_KEY, EMPTY));
    setPhoneId(getPhoneId());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) lsSet(DRAFT_KEY, draft);
  }, [draft, loaded]);

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const setDays = useCallback((fn: (days: Day[]) => Day[]) => setDraft((d) => ({ ...d, days: fn(d.days) })), []);

  if (!loaded) return <main />;

  return (
    <main>
      <h1>다음 목적지</h1>
      <p className="muted">폰에 정리한 여행 계획을 차량 내비로 이어 드려요.</p>
      <div className="steps">
        {STEP_NAMES.map(([s, name]) => (
          <span key={s} className={draft.step === s ? "on" : ""}>{name}</span>
        ))}
      </div>
      {draft.step === "input" && <InputStep draft={draft} update={update} />}
      {draft.step === "schedule" && <ScheduleStep draft={draft} update={update} setDays={setDays} />}
      {draft.step === "places" && <PlacesStep draft={draft} update={update} setDays={setDays} />}
      {draft.step === "share" && <ShareStep draft={draft} update={update} phoneId={phoneId} />}
    </main>
  );
}

/* ───────────── 1. 계획 입력 ───────────── */

function InputStep({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  const segments = useMemo(() => splitPlan(draft.text), [draft.text]);
  const needStart = segments.length > 0 && needsStartDate(segments);
  const [consent, setConsent] = useState(false);
  const [singleDay, setSingleDay] = useState(false);
  const consentedBefore = typeof window !== "undefined" && ls<boolean>(CONSENT_KEY, false);

  const noBoundary = draft.text.trim().length > 0 && segments.length === 0;
  const effective = noBoundary && singleDay ? [{ label: "1일차", dayNumber: 1, text: draft.text.trim() }] : segments;
  const needDate = (needStart || (noBoundary && singleDay)) && !draft.startDate;
  const canStart = effective.length > 0 && !needDate && (consent || consentedBefore);

  function start() {
    if (!consentedBefore) lsSet(CONSENT_KEY, true);
    const resolved = resolveDates(effective, draft.startDate || new Date().toISOString().slice(0, 10));
    const days: Day[] = resolved.map((s, i) => ({
      dayIndex: i + 1,
      date: s.date,
      label: s.label,
      text: s.text,
      region: "",
      status: "pending",
      stops: [],
    }));
    update({ days, step: "schedule" });
  }

  return (
    <>
      <div className="card">
        <label htmlFor="title">여행 이름 (선택)</label>
        <input id="title" value={draft.title} placeholder="예: 대전 1박 2일" onChange={(e) => update({ title: e.target.value })} />
        <label htmlFor="plan">여행 계획</label>
        <textarea
          id="plan"
          value={draft.text}
          placeholder={"메모·여행 앱에 정리한 계획을 그대로 붙여넣어 주세요.\n\n1일차\n- 10:00 대전역 출발\n- 12:00 성심당 본점 (13시 예약)\n2일차\n- ..."}
          onChange={(e) => update({ text: e.target.value })}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted grow">
            {segments.length > 0 ? `${segments.length}일치 일정을 찾았어요` : "날짜(11/20) 또는 일차(1일차) 줄로 날짜를 구분해요"}
          </span>
          {!draft.text && (
            <button className="small" onClick={() => update({ text: SAMPLE })}>예시 넣기</button>
          )}
        </div>
      </div>

      {noBoundary && (
        <div className="card notice">
          <p>날짜 구분을 찾지 못했어요. 날짜마다 “1일차”, “11/20”처럼 머리줄을 넣어 주세요.</p>
          <label className="toggle">
            <input type="checkbox" checked={singleDay} onChange={(e) => setSingleDay(e.target.checked)} /> 하루 일정이에요
          </label>
        </div>
      )}

      {(needStart || (noBoundary && singleDay)) && (
        <div className="card">
          <h2>여행 시작일</h2>
          <p className="muted">계획에 실제 날짜가 없어서, 1일차가 며칠인지 알려 주시면 날짜로 바꿔 드려요.</p>
          <input type="date" value={draft.startDate} onChange={(e) => update({ startDate: e.target.value })} />
          {draft.startDate && effective.length > 0 && (
            <p className="muted" style={{ marginTop: 6 }}>
              {resolveDates(effective, draft.startDate).map((s, i) => `${s.dayNumber ?? i + 1}일차 → ${fmtDate(s.date)}`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {!consentedBefore && effective.length > 0 && (
        <div className="card">
          <h2>외부 서비스 전송 안내</h2>
          <p className="muted">
            계획을 해석하려고 날짜별 텍스트를 외부 AI(Google Gemini)에, 장소명과 여행 지역을 지도 서비스(카카오)에 보내요.
            처리용 원문은 여행이 끝나면 지워요.
          </p>
          <label className="toggle" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> 확인했어요
          </label>
        </div>
      )}

      <div className="bar">
        <div>
          <button className="primary" disabled={!canStart} onClick={start}>AI로 일정표 만들기</button>
        </div>
      </div>
    </>
  );
}

/* ───────────── 2. 해석 진행 + 일정표 확인·수정 ───────────── */

function ScheduleStep({
  draft,
  update,
  setDays,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  setDays: (fn: (d: Day[]) => Day[]) => void;
}) {
  const started = useRef(false);

  const parseOne = useCallback(
    async (dayIndex: number) => {
      const day = draft.days.find((d) => d.dayIndex === dayIndex);
      if (!day) return;
      setDays((ds) => ds.map((d) => (d.dayIndex === dayIndex ? { ...d, status: "parsing", error: undefined } : d)));
      try {
        const r = await api<{ region: string; stops: Stop[] }>("/api/parse/day", {
          method: "POST",
          body: JSON.stringify({ text: day.text, context: draft.title }),
        });
        setDays((ds) => ds.map((d) => (d.dayIndex === dayIndex ? { ...d, status: "done", region: r.region, stops: r.stops } : d)));
      } catch (e) {
        setDays((ds) =>
          ds.map((d) => (d.dayIndex === dayIndex ? { ...d, status: "failed", error: e instanceof Error ? e.message : "실패" } : d)),
        );
      }
    },
    [draft.days, draft.title, setDays],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // 새로고침으로 중단된 날짜(parsing)도 다시 처리한다
    const todo = draft.days.filter((d) => d.status === "pending" || d.status === "parsing").map((d) => d.dayIndex);
    pool(todo, 3, parseOne);
  }, [draft.days, parseOne]);

  const editStop = (dayIndex: number, stopId: string, patch: Partial<Stop>) =>
    setDays((ds) =>
      ds.map((d) =>
        d.dayIndex !== dayIndex
          ? d
          : {
              ...d,
              stops: d.stops.map((s) => {
                if (s.id !== stopId) return s;
                const next = { ...s, ...patch };
                // 장소명이 바뀌면 확정했던 좌표는 다시 찾는다
                if (patch.name !== undefined && patch.name !== s.name) {
                  delete next.place;
                  delete next.candidates;
                  delete next.placeStatus;
                }
                return next;
              }),
            },
      ),
    );
  const moveStop = (dayIndex: number, idx: number, dir: -1 | 1) =>
    setDays((ds) =>
      ds.map((d) => {
        if (d.dayIndex !== dayIndex) return d;
        const stops = [...d.stops];
        const j = idx + dir;
        if (j < 0 || j >= stops.length) return d;
        [stops[idx], stops[j]] = [stops[j], stops[idx]];
        return { ...d, stops };
      }),
    );
  const removeStop = (dayIndex: number, stopId: string) =>
    setDays((ds) => ds.map((d) => (d.dayIndex === dayIndex ? { ...d, stops: d.stops.filter((s) => s.id !== stopId) } : d)));
  const addStop = (dayIndex: number) =>
    setDays((ds) =>
      ds.map((d) =>
        d.dayIndex === dayIndex ? { ...d, stops: [...d.stops, { id: uid(), name: "", time: "", memo: "", byCar: true }] } : d,
      ),
    );

  const done = draft.days.filter((d) => d.status === "done").length;
  const failed = draft.days.filter((d) => d.status === "failed");
  const busy = draft.days.some((d) => d.status === "parsing" || d.status === "pending");
  const emptyNames = draft.days.some((d) => d.stops.some((s) => !s.name.trim()));

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            {busy ? `해석 중… ${done}/${draft.days.length}일` : failed.length ? `${failed.length}일 해석 실패` : "일정표를 확인해 주세요"}
          </h2>
        </div>
        <p className="muted">틀린 곳은 바로 고칠 수 있어요. “차로 이동”을 끄면 차량 안내에서 빠져요.</p>
      </div>

      {draft.days.map((day) => (
        <div className="card" key={day.dayIndex}>
          <div className="row">
            <h2 className="grow" style={{ margin: 0 }}>
              {day.dayIndex}일차 · {fmtDate(day.date)}
            </h2>
            {day.status === "parsing" || day.status === "pending" ? (
              <span className="badge">해석 중</span>
            ) : day.status === "failed" ? (
              <span className="badge bad">실패</span>
            ) : (
              <span className="badge ok">완료</span>
            )}
          </div>
          {day.region && <p className="muted">여행 지역: {day.region}</p>}

          {day.status === "failed" && (
            <div style={{ marginTop: 8 }}>
              <p className="error">{day.error}</p>
              <details>
                <summary className="muted">원문 보기</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{day.text}</pre>
              </details>
              <button className="small" onClick={() => parseOne(day.dayIndex)}>이 날짜만 다시 해석</button>
            </div>
          )}

          {day.status === "done" && (
            <>
              {day.stops.map((s, i) => (
                <div className={`stop ${s.byCar ? "" : "off"}`} key={s.id}>
                  <div className="row">
                    <span className="num">{i + 1}</span>
                    <input
                      className="grow"
                      value={s.name}
                      placeholder="장소명 (필수)"
                      style={!s.name.trim() ? { borderColor: "var(--bad)" } : undefined}
                      onChange={(e) => editStop(day.dayIndex, s.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="fields">
                    <input
                      value={s.time}
                      placeholder="시각 14:30"
                      inputMode="numeric"
                      maxLength={5}
                      style={s.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ? { borderColor: "var(--bad)" } : undefined}
                      onChange={(e) => editStop(day.dayIndex, s.id, { time: e.target.value.replace(/[^\d:]/g, "") })}
                    />
                    <input value={s.memo} placeholder="메모 (예약, 주차 등)" onChange={(e) => editStop(day.dayIndex, s.id, { memo: e.target.value })} />
                  </div>
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <label className="toggle grow">
                      <input type="checkbox" checked={s.byCar} onChange={(e) => editStop(day.dayIndex, s.id, { byCar: e.target.checked })} />
                      차로 이동 {s.byCar ? "" : "· 안내 제외"}
                    </label>
                    <button className="small" aria-label="위로" onClick={() => moveStop(day.dayIndex, i, -1)} disabled={i === 0}>↑</button>
                    <button className="small" aria-label="아래로" onClick={() => moveStop(day.dayIndex, i, 1)} disabled={i === day.stops.length - 1}>↓</button>
                    <button className="small danger" onClick={() => removeStop(day.dayIndex, s.id)}>삭제</button>
                  </div>
                </div>
              ))}
              <button className="small" style={{ marginTop: 8 }} onClick={() => addStop(day.dayIndex)}>+ 일정 추가</button>
            </>
          )}
        </div>
      ))}

      <div className="bar">
        <div>
          <button onClick={() => update({ step: "input" })}>계획 다시 입력</button>
          <button
            className="primary"
            disabled={busy || failed.length > 0 || emptyNames || done === 0}
            onClick={() => update({ step: "places" })}
          >
            장소 확정으로
          </button>
        </div>
      </div>
    </>
  );
}

/* ───────────── 3. 장소 확정 ───────────── */

function PlacesStep({
  draft,
  update,
  setDays,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  setDays: (fn: (d: Day[]) => Day[]) => void;
}) {
  const [searching, setSearching] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [askUnresolved, setAskUnresolved] = useState(false);
  const started = useRef(false);

  const patchStop = useCallback(
    (stopId: string, patch: Partial<Stop>) =>
      setDays((ds) => ds.map((d) => ({ ...d, stops: d.stops.map((s) => (s.id === stopId ? { ...s, ...patch } : s)) }))),
    [setDays],
  );

  const search = useCallback(
    async (stop: Stop, region: string, q?: string) => {
      setSearching((s) => new Set(s).add(stop.id));
      try {
        const r = await api<{ candidates: Place[] }>("/api/places/search", {
          method: "POST",
          body: JSON.stringify({ name: q ?? stop.name, region: q ? "" : region }),
        });
        patchStop(stop.id, {
          candidates: r.candidates,
          place: r.candidates[0],
          placeStatus: r.candidates[0] ? "confirmed" : "unresolved",
        });
      } catch {
        // 검색 실패한 장소만 미확인으로 두고 다른 장소 결과는 그대로 둔다
        patchStop(stop.id, { candidates: [], place: undefined, placeStatus: "unresolved" });
      } finally {
        setSearching((s) => {
          const n = new Set(s);
          n.delete(stop.id);
          return n;
        });
      }
    },
    [patchStop],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const todo = draft.days.flatMap((d) => d.stops.filter((s) => s.byCar && !s.placeStatus).map((s) => ({ s, region: d.region })));
    pool(todo, 4, ({ s, region }) => search(s, region));
  }, [draft.days, search]);

  const carStops = draft.days.flatMap((d) => d.stops.filter((s) => s.byCar));
  const unresolved = carStops.filter((s) => s.placeStatus === "unresolved");
  const busy = searching.size > 0 || carStops.some((s) => !s.placeStatus);

  function next() {
    if (unresolved.length) setAskUnresolved(true);
    else update({ step: "share" });
  }

  return (
    <>
      <div className="card">
        <h2>{busy ? "장소를 찾는 중…" : "장소를 확인해 주세요"}</h2>
        <p className="muted">장소마다 첫 번째 검색 결과를 골라 뒀어요. 다르면 눌러서 바꿔 주세요.</p>
        {!busy && unresolved.length > 0 && <p className="error">찾지 못한 장소 {unresolved.length}곳</p>}
      </div>

      {draft.days.map((day) => (
        <div className="card" key={day.dayIndex}>
          <h2>
            {day.dayIndex}일차 · {fmtDate(day.date)}
          </h2>
          {day.stops.map((s, i) => (
            <div className={`stop ${s.byCar ? "" : "off"}`} key={s.id}>
              <div className="row">
                <span className="num">{i + 1}</span>
                <div className="grow">
                  <div>
                    {s.time && <span className="muted">{s.time} </span>}
                    <strong>{s.name}</strong>
                  </div>
                  {!s.byCar ? (
                    <span className="muted">차로 이동하지 않아 안내에서 빠져요</span>
                  ) : searching.has(s.id) || !s.placeStatus ? (
                    <span className="muted">찾는 중…</span>
                  ) : s.place ? (
                    <span className="muted">
                      {s.place.name} · {s.place.address}
                    </span>
                  ) : (
                    <span className="error">지도에서 찾지 못했어요</span>
                  )}
                </div>
                {s.byCar && s.placeStatus && !searching.has(s.id) && (
                  <button
                    className="small"
                    onClick={() => {
                      setOpen(open === s.id ? null : s.id);
                      setQuery(s.name);
                    }}
                  >
                    {s.place ? "변경" : "직접 지정"}
                  </button>
                )}
              </div>

              {open === s.id && (
                <div className="cands">
                  {(s.candidates ?? []).map((c) => (
                    <button
                      key={c.id}
                      className={`cand ${s.place?.id === c.id ? "sel" : ""}`}
                      onClick={() => {
                        patchStop(s.id, { place: c, placeStatus: "confirmed" });
                        setOpen(null);
                      }}
                    >
                      <strong>{c.name}</strong>
                      <br />
                      <span className="muted">{c.address}</span>
                    </button>
                  ))}
                  <div className="row">
                    <input className="grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="다른 이름으로 검색" />
                    <button className="small" disabled={!query.trim()} onClick={() => search(s, day.region, query.trim())}>
                      검색
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {askUnresolved && (
        <div className="modal" onClick={() => setAskUnresolved(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <h2>찾지 못한 장소가 {unresolved.length}곳 있어요</h2>
            <p className="muted">{unresolved.map((s) => s.name).join(", ")}</p>
            <p className="muted">일단 진행하면 차량에서 그 차례가 됐을 때 음성으로 장소를 물어봐요.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="grow"
                onClick={() => {
                  setAskUnresolved(false);
                  setOpen(unresolved[0].id);
                  setQuery(unresolved[0].name);
                }}
              >
                직접 지정
              </button>
              <button className="primary grow" onClick={() => update({ step: "share" })}>
                일단 진행
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bar">
        <div>
          <button onClick={() => update({ step: "schedule" })}>일정표로</button>
          <button className="primary" disabled={busy} onClick={next}>
            저장하고 차량 연결
          </button>
        </div>
      </div>
    </>
  );
}

/* ───────────── 4. 저장·코드 발급·차량 승인 ───────────── */

type Conn = { id: string; vehicleName: string; createdAt: number };

function ShareStep({ draft, update, phoneId }: { draft: Draft; update: (p: Partial<Draft>) => void; phoneId: string }) {
  const [saved, setSaved] = useState<"saving" | "saved" | "error">("saving");
  const [error, setError] = useState("");
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [request, setRequest] = useState<{ id: string; vehicleName: string } | null>(null);
  const [conns, setConns] = useState<Conn[]>([]);

  const loadConns = useCallback(async () => {
    const r = await api<{ connections: Conn[] }>(`/api/pair/connections?phoneId=${phoneId}`).catch(() => null);
    if (r) setConns(r.connections);
  }, [phoneId]);

  // 들어가자마자 확정 계획을 서버에 저장 (이미 연결된 차량은 이 계획을 불러간다)
  useEffect(() => {
    const plan: Plan = {
      title: draft.title || "여행",
      startDate: draft.days[0]?.date ?? "",
      updatedAt: Date.now(),
      days: draft.days.map((d) => ({ ...d, stops: d.stops.map((s) => ({ ...s, candidates: undefined })) })),
    };
    api("/api/plan", { method: "PUT", body: JSON.stringify({ phoneId, plan }) })
      .then(() => setSaved("saved"))
      .catch((e) => {
        setSaved("error");
        setError(e.message);
      });
    loadConns();
  }, [draft, phoneId, loadConns]);

  async function issue() {
    setError("");
    try {
      setCode(await api<{ code: string; expiresAt: number }>("/api/pair/code", { method: "POST", body: JSON.stringify({ phoneId }) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "코드 발급 실패");
    }
  }

  const left = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
  const waiting = !!code && (left > 0 || !!request);

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [code]);

  // 차량의 연결 요청을 2초마다 확인
  useEffect(() => {
    if (!waiting || request) return;
    const t = setInterval(async () => {
      const r = await api<{ request: { id: string; vehicleName: string } | null }>(`/api/pair/request?phoneId=${phoneId}`).catch(() => null);
      if (r?.request) setRequest(r.request);
    }, 2000);
    return () => clearInterval(t);
  }, [waiting, request, phoneId]);

  async function decide(approve: boolean) {
    if (!request) return;
    await api("/api/pair/request", { method: "POST", body: JSON.stringify({ phoneId, requestId: request.id, approve }) }).catch((e) =>
      setError(e.message),
    );
    setRequest(null);
    setCode(null);
    loadConns();
  }

  async function disconnect(id: string) {
    await api("/api/pair/connections", { method: "DELETE", body: JSON.stringify({ phoneId, id }) }).catch(() => null);
    loadConns();
  }

  const carStops = draft.days.flatMap((d) => d.stops.filter((s) => s.byCar));

  return (
    <>
      <div className="card">
        <h2>{saved === "saving" ? "계획 저장 중…" : saved === "saved" ? "계획을 저장했어요" : "저장하지 못했어요"}</h2>
        <p className="muted">
          {draft.days.length}일 · 차량 안내 {carStops.length}곳
          {carStops.some((s) => !s.place) && ` (미확인 ${carStops.filter((s) => !s.place).length}곳)`}
        </p>
        {conns.length > 0 && saved === "saved" && <p className="muted">연결된 차량은 다음 목적지 제안 때 이 계획을 불러가요.</p>}
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <h2>차량 연결 코드</h2>
        {code && left > 0 ? (
          <>
            <div className="code">{code.code}</div>
            <p className="muted">차량 앱에 입력해 주세요 · {left}초 남음</p>
            <p className="muted">차량의 연결 요청을 기다리는 중…</p>
          </>
        ) : code && !request ? (
          <>
            <p className="error">코드가 만료됐어요.</p>
            <button className="primary" onClick={issue}>새 코드 받기</button>
          </>
        ) : (
          <>
            <p className="muted">처음 연결하는 차량에만 필요해요. 코드는 1분 동안 쓸 수 있어요.</p>
            <button className="primary" style={{ marginTop: 8 }} disabled={saved !== "saved"} onClick={issue}>
              6자리 코드 받기
            </button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>연결된 차량</h2>
        {conns.length === 0 ? (
          <p className="muted">아직 없어요.</p>
        ) : (
          conns.map((c) => (
            <div className="row stop" key={c.id}>
              <span className="grow">
                {c.vehicleName}
                <br />
                <span className="muted">{new Date(c.createdAt).toLocaleString("ko-KR")} 연결</span>
              </span>
              <button className="small danger" onClick={() => disconnect(c.id)}>연결 해제</button>
            </div>
          ))
        )}
      </div>

      {request && (
        <div className="modal">
          <div className="card">
            <h2>차량 연결 요청</h2>
            <p>
              <strong>{request.vehicleName}</strong>에서 이 여행 계획을 불러오려고 해요.
            </p>
            <p className="muted">승인하면 이 차량은 다음부터 코드 없이 계획을 불러와요. 차량에서는 계획을 고칠 수 없어요.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="grow danger" onClick={() => decide(false)}>거절</button>
              <button className="primary grow" onClick={() => decide(true)}>승인</button>
            </div>
          </div>
        </div>
      )}

      <div className="bar">
        <div>
          <button onClick={() => update({ step: "schedule" })}>계획 수정</button>
          <button
            onClick={() => {
              if (confirm("새 여행 계획을 입력할까요? 지금 계획은 저장된 상태로 남아요.")) update({ ...EMPTY });
            }}
          >
            새 계획
          </button>
        </div>
      </div>
    </>
  );
}

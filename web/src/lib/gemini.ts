// 날짜 구간 하나를 LLM으로 구조화한다. GEMINI_API_KEY가 없으면 규칙 기반 해석으로 대신한다.
import { newId } from "./id";
import type { Stop } from "./types";

export type DayParse = { region: string; stops: Stop[]; engine: "gemini" | "rules" };

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const PROMPT = `너는 여행 메모를 차량 내비 안내용 일정으로 바꾸는 도우미다.
아래는 여행 계획 중 하루치 메모다. 방문 순서대로 일정을 뽑아라.
- name: 내비에 검색할 장소명 (가게·관광지 이름만, 수식어 제외). 장소가 불분명하면 메모 표현 그대로.
- time: 예정 시각 "HH:MM" (24시간). 없으면 "".
- memo: 예약·주차·메뉴 등 운전자에게 알려줄 짧은 메모. 없으면 "".
- byCar: 차를 몰고 가야 하는 이동이면 true. 숙소 휴식, 근처 산책, 도보 구경, 같은 건물 안 이동처럼 운전이 필요 없으면 false.
- region: 이 날 여행 지역 (예: "대전 중구", "제주"). 모르겠으면 "".
일정에 없는 장소를 지어내지 마라.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    region: { type: "STRING" },
    stops: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          time: { type: "STRING" },
          memo: { type: "STRING" },
          byCar: { type: "BOOLEAN" },
        },
        required: ["name", "time", "memo", "byCar"],
      },
    },
  },
  required: ["region", "stops"],
};

type RawStop = { name: string; time: string; memo: string; byCar: boolean };

function normalizeTime(t: string): string {
  const m = t?.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function toStops(raw: RawStop[]): Stop[] {
  return raw
    .filter((r) => r.name?.trim())
    .map((r) => ({
      id: newId(8),
      name: r.name.trim(),
      time: normalizeTime(r.time),
      memo: (r.memo ?? "").trim(),
      byCar: r.byCar !== false,
    }));
}

async function parseWithGemini(text: string, key: string, context: string): Promise<DayParse> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${PROMPT}\n\n여행 제목/맥락: ${context || "(없음)"}\n\n[하루치 메모]\n${text}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) throw new Error(`Gemini 오류 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("Gemini 응답이 비어 있어요");
  const parsed = JSON.parse(out) as { region: string; stops: RawStop[] };
  return { region: parsed.region ?? "", stops: toStops(parsed.stops ?? []), engine: "gemini" };
}

const NOT_BY_CAR = /(산책|도보|걸어|숙소\s*(에서)?\s*휴식|체크인\s*후\s*휴식|호텔\s*휴식|구경하며)/;

/** 키 없이 시연할 때 쓰는 단순 규칙 해석: 한 줄 = 일정 하나 */
export function parseWithRules(text: string): DayParse {
  const raw: RawStop[] = [];
  for (const line of text.split(/\r?\n/)) {
    let s = line.trim().replace(/^[-*•·]+\s*/, "").replace(/^\d+[.)]\s+/, "").trim();
    if (!s) continue;
    const tm = s.match(/(\d{1,2}):(\d{2})|(\d{1,2})\s*시(?!간)/);
    let time = "";
    if (tm && s.indexOf(tm[0]) < 3) {
      const h = Number(tm[1] ?? tm[3]);
      time = `${h < 7 ? h + 12 : h}:${tm[2] ?? "00"}`; // "3시"는 오후 3시로 본다
      s = s.replace(tm[0], "").trim();
    }
    let memo = "";
    const paren = s.match(/[(\[](.+?)[)\]]/);
    if (paren) {
      memo = paren[1].trim();
      s = s.replace(paren[0], "").trim();
    }
    const dash = s.split(/\s+[-–:]\s+/);
    if (dash.length > 1) {
      memo = [dash.slice(1).join(" "), memo].filter(Boolean).join(", ");
      s = dash[0];
    }
    const byCar = !NOT_BY_CAR.test(line);
    const name = s.replace(/\s*(에서|에|으로|로)?\s*(점심|저녁|아침|출발|도착|방문|구경|식사|체크인)$/, "").trim() || s;
    raw.push({ name, time, memo, byCar });
  }
  return { region: "", stops: toStops(raw), engine: "rules" };
}

export async function parseDay(text: string, context: string): Promise<DayParse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return parseWithRules(text);
  return parseWithGemini(text, key, context);
}

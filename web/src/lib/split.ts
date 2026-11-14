// 붙여넣은 여러 날짜 계획을 날짜 구간으로 나눈다 (LLM 호출 전, 브라우저에서 실행)

export type Segment = {
  label: string; // 원문 날짜 표기
  dayNumber?: number; // "2일차" → 2
  date?: string; // 원문에 실제 날짜가 있으면 YYYY-MM-DD
  text: string;
};

const KOREAN_ORDINAL: Record<string, number> = {
  첫: 1, 둘: 2, 셋: 3, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function guessYear(month: number, day: number, today = new Date()): number {
  const y = today.getFullYear();
  const candidate = new Date(y, month - 1, day);
  const diffDays = (candidate.getTime() - today.getTime()) / 86400000;
  return diffDays < -60 ? y + 1 : y; // 두 달 넘게 지난 날짜면 내년 여행으로 본다
}

/** 한 줄이 날짜 머리줄이면 그 정보를 돌려준다 */
export function parseHeader(line: string): Omit<Segment, "text"> | null {
  const s = line.trim().replace(/^[#>*\-•\[\(【\s]+/, "");
  if (!s || s.length > 40) return null;
  let date: string | undefined;
  let dayNumber: number | undefined;

  const full = s.match(/^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
  const short = s.match(/^(\d{1,2})\s*[\/.월]\s*(\d{1,2})(?!\d)\s*일?/);
  if (full) date = `${full[1]}-${pad(+full[2])}-${pad(+full[3])}`;
  else if (short && +short[1] >= 1 && +short[1] <= 12 && +short[2] >= 1 && +short[2] <= 31) {
    date = `${guessYear(+short[1], +short[2])}-${pad(+short[1])}-${pad(+short[2])}`;
  }

  const nth = s.match(/(\d+)\s*일\s*차/) ?? s.match(/^day\s*(\d+)/i);
  const ord = s.match(/^(첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)\s*째\s*날/);
  if (nth) dayNumber = +nth[1];
  else if (ord) dayNumber = KOREAN_ORDINAL[ord[1]];

  if (!date && !dayNumber) return null;
  // 날짜 머리줄 뒤에 시간 표기가 바로 오면(예: "11/20 10:00 출발") 일정 줄로 본다
  if (date && !dayNumber && /^\S+\s+\d{1,2}:\d{2}/.test(s)) return null;
  return { label: s.slice(0, 20), date, dayNumber };
}

export function splitPlan(text: string): Segment[] {
  const segments: Segment[] = [];
  let current: Segment | null = null;
  for (const line of text.split(/\r?\n/)) {
    const header = parseHeader(line);
    if (header) {
      current = { ...header, text: "" };
      segments.push(current);
      // 머리줄 뒤에 같은 줄로 이어 쓴 일정도 본문에 넣는다
      const rest = line.trim().replace(/^.*?(일\s*차|째\s*날|day\s*\d+)\s*[:\-)\]】]?/i, "");
      if (header.dayNumber && rest && rest !== line.trim()) current.text += rest + "\n";
    } else if (current) {
      current.text += line + "\n";
    }
  }
  return segments
    .map((s) => ({ ...s, text: s.text.trim() }))
    .filter((s) => s.text.length > 0);
}

export function needsStartDate(segments: Segment[]): boolean {
  return segments.some((s) => !s.date);
}

/** 일차만 있는 구간에 시작일 기준 날짜를 채운다 */
export function resolveDates(segments: Segment[], startDate: string): (Segment & { date: string })[] {
  const base = new Date(startDate + "T00:00:00");
  return segments.map((s, i) => {
    if (s.date) return { ...s, date: s.date };
    const d = new Date(base);
    d.setDate(d.getDate() + (s.dayNumber ?? i + 1) - 1);
    return { ...s, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
  });
}

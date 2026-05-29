import { NextResponse } from "next/server";

export const runtime = "nodejs";

type BarChord = { bar: number; chord: string; };
type ScoreSection = { label: string; startBar: number; endBar?: number; };
type NoteEntry = { keys: string[]; duration: "8" | "q" | "h" | "w" | "8r" | "qr" | "hr"; chord: string; };
type MelodyResponse = {
  title: string; composer: string; key: string; tempo: string;
  timeSignature: "4/4"; totalBars: number; barsPerLine: number;
  chordProgression: string[]; barChords: BarChord[]; sections: ScoreSection[];
  notes: NoteEntry[]; fallback?: boolean;
};

// ============================================================
// 🎵 음악이론 기반 코드 파서
// ============================================================
const NOTE_TO_SEMI: Record<string, number> = {
  'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,
  'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11
};
const SEMI_TO_NOTE = ['c','db','d','eb','e','f','gb','g','ab','a','bb','b'];

const QUALITY_INTERVALS: Record<string, number[]> = {
  'maj7':[0,4,7,11], 'maj9':[0,4,7,11,14], 'maj':[0,4,7], '6':[0,4,7,9],
  'm7':[0,3,7,10], 'm9':[0,3,7,10,14], 'm':[0,3,7], 'm6':[0,3,7,9],
  '7':[0,4,7,10], '9':[0,4,7,10,14], '7b9':[0,4,7,10,13],
  '7#9':[0,4,7,10,15], '7b5':[0,4,6,10], '7#5':[0,4,8,10],
  'm7b5':[0,3,6,10], 'dim7':[0,3,6,9], 'dim':[0,3,6],
  'aug':[0,4,8], 'sus4':[0,5,7,10], 'sus2':[0,2,7,10],
};
const PASSING_INTERVALS: Record<string, number[]> = {
  'maj7':[2,9],'maj9':[2,9],'maj':[2,9],'6':[2,9],
  'm7':[2,5],'m9':[2,5],'m':[2,5],'m6':[2,5],
  '7':[2,9],'9':[2],'7b9':[2],'7#9':[2],
  'm7b5':[2,5],'dim7':[2,5],'dim':[2,5],
};

function parseRoot(chord: string): { root: string; rest: string } {
  const m = chord.match(/^([A-G][b#]?)/);
  return m ? { root: m[1], rest: chord.slice(m[1].length) } : { root: 'C', rest: chord };
}

function parseQuality(rest: string): string {
  const r = rest.trim().replace(/△|Δ/g,'maj').replace(/ø/g,'m7b5').replace(/°/g,'dim').replace(/\+/g,'aug');
  const checks: [RegExp, string][] = [
    [/m7b5|m7\(b5\)|-7b5|ø/,'m7b5'],
    [/maj9|M9/,'maj9'],[/maj7|M7/,'maj7'],[/maj|M(?=[^a-z]|$)/,'maj'],
    [/m9|-9|min9/,'m9'],[/m7|-7|min7/,'m7'],[/m6|-6|min6/,'m6'],
    [/dim7|o7|07/,'dim7'],[/dim|o(?=[^a-z]|$)/,'dim'],
    [/m|-(?=[^0-9]|$)|min(?!7)/,'m'],
    [/aug/,'aug'],[/7b9/,'7b9'],[/7#9/,'7#9'],[/7b5|\(b5\)/,'7b5'],[/7#5/,'7#5'],
    [/sus4/,'sus4'],[/sus2/,'sus2'],
    [/^9/,'9'],[/^7/,'7'],[/^6/,'6'],[/^$/,'maj'],
  ];
  for (const [p,q] of checks) if (p.test(r)) return q;
  return 'maj7';
}

function buildChordPalette(chord: string): { ct: string[]; ps: string[] } {
  const { root, rest } = parseRoot(chord);
  const quality = parseQuality(rest);
  const rootSemi = NOTE_TO_SEMI[root] ?? 0;
  const intervals = QUALITY_INTERVALS[quality] ?? QUALITY_INTERVALS['maj7'];
  const passingInts = PASSING_INTERVALS[quality] ?? [2, 5];

  const toKey = (i: number) => {
    const total = rootSemi + i;
    const note = SEMI_TO_NOTE[total % 12];
    const oct = total >= 12 ? 5 : 4;
    return `${note}/${Math.min(5, Math.max(4, oct))}`;
  };

  return {
    ct: intervals.slice(0, 4).map(toKey),
    ps: passingInts.map(toKey),
  };
}

// ============================================================
// 🎨 스타일 감지
// ============================================================
type StyleType = "miles" | "bebop" | "ballad" | "gospel" | "jazz";

function detectStyle(style: string): StyleType {
  const s = style.toLowerCase();
  if (s.includes("마일스") || s.includes("miles") || s.includes("cool")) return "miles";
  if (s.includes("비밥") || s.includes("bebop")) return "bebop";
  if (s.includes("발라드") || s.includes("ballad") || s.includes("slow")) return "ballad";
  if (s.includes("가스펠") || s.includes("gospel") || s.includes("소울") || s.includes("soul")) return "gospel";
  return "jazz";
}

// ============================================================
// 🎼 스타일+코드 기반 음표 생성 (결정론적, 항상 정확)
// ============================================================
function buildBarNotes(chord: string, barIndex: number, styleType: StyleType): NoteEntry[] {
  const { ct, ps } = buildChordPalette(chord);
  const c0 = ct[0] ?? 'c/4';
  const c1 = ct[1] ?? ct[0] ?? 'e/4';
  const c2 = ct[2] ?? ct[0] ?? 'g/4';
  const c3 = ct[3] ?? ct[1] ?? 'b/4';
  const p0 = ps[0] ?? 'd/4';
  const p1 = ps[1] ?? 'a/4';

  const R = (d: "qr"|"hr"|"8r"): NoteEntry => ({ keys:["b/4"], duration:d, chord });
  const N = (k: string, d: "8"|"q"|"h"): NoteEntry => ({ keys:[k], duration:d, chord });

  // 마일스 데이비스: 매우 sparse, 쉼표 많음
  const miles: NoteEntry[][] = [
    [N(c1,"h"), R("hr")],
    [R("qr"), N(c0,"h"), R("qr")],
    [N(c2,"h"), R("qr"), N(c0,"q")],
    [R("hr"), N(c1,"q"), N(c0,"q")],
    [N(c0,"q"), R("hr"), N(c2,"q")],
    [R("qr"), N(c2,"h"), R("qr")],
    [N(c1,"h"), R("qr"), N(c2,"q")],
    [R("hr"), N(c0,"h")],
    [N(c3,"h"), R("hr")],
    [R("qr"), N(c1,"h"), R("qr")],
    [N(c0,"q"), R("qr"), N(c1,"h")],
    [R("hr"), N(c2,"h")],
    [N(c2,"q"), R("hr"), N(c0,"q")],
    [R("qr"), N(c3,"h"), R("qr")],
    [N(c1,"q"), N(c0,"h"), R("qr")],
    [R("hr"), N(c1,"q"), N(c2,"q")],
  ];

  // 비밥: 8분음표 빽빽, 코드톤+패싱노트
  const bebop: NoteEntry[][] = [
    [N(c0,"8"),N(p0,"8"),N(c1,"8"),N(p1,"8"),N(c2,"8"),N(p0,"8"),N(c1,"8"),N(c0,"8")],
    [N(c1,"8"),N(c2,"8"),N(p0,"8"),N(c3,"8"),N(c2,"8"),N(c1,"8"),N(p1,"8"),N(c0,"8")],
    [N(c2,"8"),N(p1,"8"),N(c1,"8"),N(c0,"8"),N(p0,"8"),N(c1,"8"),N(c2,"q")],
    [N(c0,"8"),N(c1,"8"),N(c2,"8"),N(c3,"8"),N(c2,"8"),N(p0,"8"),N(c1,"q")],
    [N(p0,"8"),N(c0,"8"),N(c1,"8"),N(c2,"8"),N(c1,"8"),N(c0,"8"),N(p1,"q")],
    [N(c3,"8"),N(c2,"8"),N(c1,"8"),N(p0,"8"),N(c0,"8"),N(p1,"8"),N(c2,"q")],
    [N(c1,"q"),N(c2,"8"),N(c3,"8"),N(c2,"8"),N(c1,"8"),N(p0,"8"),N(c0,"8")],
    [N(c0,"8"),N(p1,"8"),N(c1,"8"),N(c2,"8"),N(p0,"8"),N(c3,"8"),N(c2,"q")],
    [N(c2,"8"),N(c3,"8"),N(p0,"8"),N(c1,"8"),N(c0,"8"),N(p1,"8"),N(c1,"q")],
    [N(p1,"8"),N(c2,"8"),N(c1,"8"),N(c0,"8"),N(p0,"8"),N(c2,"8"),N(c3,"q")],
    [N(c1,"8"),N(p0,"8"),N(c2,"8"),N(c1,"8"),N(c0,"8"),N(p1,"8"),N(c1,"q")],
    [N(c3,"8"),N(p1,"8"),N(c2,"8"),N(c0,"8"),N(c1,"8"),N(p0,"8"),N(c2,"q")],
    [N(c0,"q"),N(c1,"8"),N(c2,"8"),N(c3,"8"),N(c2,"8"),N(c1,"8"),N(p0,"8")],
    [N(c2,"8"),N(c1,"8"),N(p0,"8"),N(c0,"8"),N(p1,"8"),N(c1,"8"),N(c2,"q")],
    [N(p0,"8"),N(p1,"8"),N(c0,"8"),N(c1,"8"),N(c2,"8"),N(c3,"8"),N(c2,"q")],
    [N(c1,"8"),N(c2,"8"),N(c3,"8"),N(p0,"8"),N(c2,"8"),N(c1,"8"),N(c0,"q")],
  ];

  // 발라드: 롱톤, 매우 느리고 서정적
  const ballad: NoteEntry[][] = [
    [N(c1,"h"), N(c0,"h")],
    [N(c2,"h"), R("hr")],
    [R("qr"), N(c0,"h"), R("qr")],
    [N(c1,"h"), R("qr"), N(c2,"q")],
    [N(c0,"q"), N(c1,"h"), R("qr")],
    [R("hr"), N(c2,"h")],
    [N(c3,"h"), R("qr"), N(c0,"q")],
    [N(c0,"h"), N(c2,"h")],
    [R("qr"), N(c1,"h"), N(c0,"q")],
    [N(c2,"h"), N(c1,"h")],
    [N(c0,"h"), R("qr"), N(c3,"q")],
    [R("hr"), N(c1,"h")],
    [N(c1,"q"), N(c2,"h"), R("qr")],
    [N(c3,"h"), N(c1,"h")],
    [R("qr"), N(c2,"h"), N(c0,"q")],
    [N(c0,"h"), R("hr")],
  ];

  // 가스펠: 소울풀, 2,4박 강조
  const gospel: NoteEntry[][] = [
    [N(c0,"q"),N(c1,"8"),N(c2,"8"),N(c1,"q"),N(c0,"q")],
    [R("qr"),N(c1,"q"),N(c2,"8"),N(c1,"8"),N(c0,"q")],
    [N(c0,"8"),N(c1,"8"),N(c2,"q"),N(c1,"8"),N(c0,"8"),R("qr")],
    [N(c2,"q"),R("qr"),N(c1,"q"),N(c0,"q")],
    [N(c0,"q"),N(c2,"8"),N(c1,"8"),R("qr"),N(c0,"q")],
    [R("qr"),N(c2,"q"),N(c1,"8"),N(c0,"8"),R("qr")],
    [N(c1,"8"),N(c2,"8"),N(c1,"q"),R("qr"),N(c0,"q")],
    [N(c0,"q"),R("qr"),N(c2,"q"),N(c1,"q")],
    [N(c1,"q"),N(c0,"8"),N(c1,"8"),N(c2,"q"),R("qr")],
    [R("qr"),N(c0,"q"),N(c1,"8"),N(c2,"8"),R("qr")],
    [N(c2,"8"),N(c1,"8"),R("qr"),N(c0,"q"),N(c1,"q")],
    [N(c0,"q"),N(c2,"q"),R("qr"),N(c1,"q")],
    [R("qr"),N(c1,"8"),N(c2,"8"),N(c1,"q"),N(c0,"q")],
    [N(c1,"q"),R("qr"),N(c2,"8"),N(c1,"8"),R("qr")],
    [N(c0,"8"),N(p0,"8"),N(c1,"q"),N(c2,"8"),N(c1,"8"),R("qr")],
    [R("qr"),N(c2,"q"),N(c0,"8"),N(c1,"8"),R("qr")],
  ];

  // 재즈: 다양한 리듬 믹스
  const jazz: NoteEntry[][] = [
    [N(c0,"q"),N(p0,"8"),N(c1,"8"),N(c2,"h")],
    [R("qr"),N(c1,"q"),N(c2,"8"),N(p0,"8"),N(c0,"q")],
    [N(c2,"8"),N(c1,"8"),R("qr"),N(c0,"h")],
    [N(c1,"h"),N(p0,"8"),N(c2,"8"),R("qr")],
    [R("hr"),N(c0,"8"),N(c1,"8"),N(c2,"q")],
    [N(c0,"8"),N(p1,"8"),N(c1,"q"),N(c2,"h")],
    [N(c2,"q"),R("qr"),N(c0,"8"),N(c1,"8"),R("qr")],
    [N(c1,"8"),N(c2,"8"),N(c1,"8"),N(c0,"8"),N(p0,"h")],
    [N(c0,"h"),R("qr"),N(c2,"q")],
    [R("qr"),N(c2,"8"),N(p0,"8"),N(c1,"h")],
    [N(c1,"q"),N(c0,"8"),N(p1,"8"),R("hr")],
    [N(c2,"8"),N(c3,"8"),R("qr"),N(c1,"h")],
    [R("qr"),N(c0,"q"),N(c2,"8"),N(c1,"8"),R("qr")],
    [N(c3,"h"),N(p0,"8"),N(c1,"8"),R("qr")],
    [N(c0,"8"),N(c1,"8"),N(c2,"q"),R("hr")],
    [R("hr"),N(c1,"q"),N(c0,"q")],
  ];

  const patterns = { miles, bebop, ballad, gospel, jazz }[styleType];
  return patterns[barIndex % patterns.length];
}

// ============================================================
// API Route
// ============================================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title ?? "Untitled").trim();
    const composer = String(body.composer ?? "Unknown").trim();
    const key = String(body.key ?? "C major").trim();
    const tempo = String(body.tempo ?? "Medium Swing").trim();
    const style = String(body.style ?? "jazz").trim();
    const totalBars = clamp(body.totalBars, 4, 64, 16);
    const barsPerLine = clamp(body.barsPerLine, 1, 8, 4);
    const chordProgression: string[] = Array.isArray(body.chordProgression) ? body.chordProgression : ["Cmaj7","Am7","Dm7","G7"];
    const barChords = normalizeBarChords(body.barChords, chordProgression, totalBars);
    const sections = normalizeSections(body.sections, totalBars);
    const styleType = detectStyle(style);

    // 코드+스타일 기반으로 음표 직접 생성 (항상 정확)
    const notes = barChords.flatMap((bc, i) => buildBarNotes(bc.chord, i, styleType));

    const result: MelodyResponse = {
      title, composer, key, tempo,
      timeSignature: "4/4",
      totalBars, barsPerLine,
      chordProgression: barChords.map(b => b.chord),
      barChords, sections, notes
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Server error", message: String(error) }, { status: 500 });
  }
}

function clamp(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeBarChords(raw: unknown, chords: string[], total: number): BarChord[] {
  const arr = Array.isArray(raw) ? raw : [];
  const map = new Map<number, string>(
    arr.filter((e): e is BarChord => e && typeof e.bar === 'number' && typeof e.chord === 'string')
       .map((e) => [e.bar, e.chord])
  );
  return Array.from({ length: total }, (_, i) => ({
    bar: i + 1,
    chord: map.get(i + 1) ?? chords[i % Math.max(1, chords.length)] ?? "Cmaj7"
  }));
}

function normalizeSections(raw: unknown, total: number): ScoreSection[] {
  const arr = Array.isArray(raw) ? raw : [];
  const valid = arr.filter((s): s is ScoreSection => s && typeof s.label === 'string' && typeof s.startBar === 'number');
  if (!valid.length) return [{ label: "A", startBar: 1, endBar: total }];
  return valid.map(s => ({
    label: s.label,
    startBar: Math.min(total, Math.max(1, Math.round(s.startBar))),
    endBar: s.endBar ? Math.min(total, Math.max(1, Math.round(s.endBar))) : undefined
  }));
}

export {};

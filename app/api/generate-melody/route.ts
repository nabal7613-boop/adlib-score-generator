import { NextResponse } from "next/server";

export const runtime = "nodejs";
const CLAUDE_MODEL = "claude-sonnet-4-6";

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
// 🎵 범용 코드 파서 - 어떤 코드든 처리
// ============================================================

// 음이름 → 반음 번호
const NOTE_TO_SEMI: Record<string, number> = {
  'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,
  'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11
};

// 반음 번호 → VexFlow 음이름 (플랫 선호)
const SEMI_TO_NOTE = ['c','db','d','eb','e','f','gb','g','ab','a','bb','b'];

// 코드 품질별 반음 인터벌
const QUALITY_INTERVALS: Record<string, number[]> = {
  'maj7':  [0, 4, 7, 11],
  'maj9':  [0, 4, 7, 11, 14],
  'maj':   [0, 4, 7],
  '6':     [0, 4, 7, 9],
  'm7':    [0, 3, 7, 10],
  'm9':    [0, 3, 7, 10, 14],
  'm':     [0, 3, 7],
  'm6':    [0, 3, 7, 9],
  '7':     [0, 4, 7, 10],
  '9':     [0, 4, 7, 10, 14],
  '7b9':   [0, 4, 7, 10, 13],
  '7#9':   [0, 4, 7, 10, 15],
  '7b5':   [0, 4, 6, 10],
  '7#5':   [0, 4, 8, 10],
  'm7b5':  [0, 3, 6, 10],
  'dim7':  [0, 3, 6, 9],
  'dim':   [0, 3, 6],
  'aug':   [0, 4, 8],
  'sus4':  [0, 5, 7, 10],
  'sus2':  [0, 2, 7, 10],
};

// 패싱 노트 인터벌 (코드 품질별)
const PASSING_INTERVALS: Record<string, number[]> = {
  'maj7': [2, 9], 'maj9': [2, 9], 'maj': [2, 9], '6': [2, 9],
  'm7': [2, 5], 'm9': [2, 5], 'm': [2, 5], 'm6': [2, 5],
  '7': [2, 9], '9': [2], '7b9': [2], '7#9': [2],
  'm7b5': [2, 5], 'dim7': [2, 5], 'dim': [2, 5],
  'default': [2, 5],
};

function parseChordRoot(chord: string): { root: string; rest: string } {
  const m = chord.match(/^([A-G][b#]?)/);
  if (!m) return { root: 'C', rest: chord };
  return { root: m[1], rest: chord.slice(m[1].length) };
}

function parseChordQuality(rest: string): string {
  const r = rest.trim()
    .replace(/△|Δ/, 'maj')
    .replace(/ø/, 'm7b5')
    .replace(/°/, 'dim')
    .replace(/\+/, 'aug');

  // 순서 중요: 더 구체적인 것 먼저
  const checks: [RegExp, string][] = [
    [/m7b5|m7\(b5\)|-7b5/, 'm7b5'],
    [/maj9|M9/, 'maj9'],
    [/maj7|M7/, 'maj7'],
    [/maj|M(?!aj)(?=[^a-z]|$)/, 'maj'],
    [/m9|-9|min9/, 'm9'],
    [/m7|-7|min7/, 'm7'],
    [/m6|-6|min6/, 'm6'],
    [/m|-|min(?!7)/, 'm'],
    [/dim7/, 'dim7'],
    [/dim/, 'dim'],
    [/aug/, 'aug'],
    [/7b9/, '7b9'],
    [/7#9/, '7#9'],
    [/7b5|\(b5\)/, '7b5'],
    [/7#5/, '7#5'],
    [/sus4/, 'sus4'],
    [/sus2/, 'sus2'],
    [/^9/, '9'],
    [/^7/, '7'],
    [/^6/, '6'],
    [/^$/, 'maj'],
  ];

  for (const [pattern, quality] of checks) {
    if (pattern.test(r)) return quality;
  }
  return 'maj7';
}

function semiToVexKey(semi: number, baseOctave: number): string {
  const note = SEMI_TO_NOTE[semi % 12];
  const octave = baseOctave + Math.floor(semi / 12);
  return `${note}/${Math.min(5, Math.max(4, octave))}`;
}

function buildChordPalette(chord: string): { chordTones: string[]; passing: string[] } {
  const { root, rest } = parseChordRoot(chord);
  const quality = parseChordQuality(rest);
  const rootSemi = NOTE_TO_SEMI[root] ?? 0;

  const intervals = QUALITY_INTERVALS[quality] ?? QUALITY_INTERVALS['maj7'];
  const passingInts = PASSING_INTERVALS[quality] ?? PASSING_INTERVALS['default'];

  // 4옥타브 기준, 음이 12반음 이상이면 5옥타브로
  const chordTones = intervals.slice(0, 4).map(i => {
    const semi = rootSemi + i;
    return semiToVexKey(semi % 12, semi >= 12 ? 5 : 4);
  });

  const passing = passingInts.map(i => {
    const semi = rootSemi + i;
    return semiToVexKey(semi % 12, semi >= 12 ? 5 : 4);
  });

  return { chordTones, passing };
}

// ============================================================
// 스타일 감지 & 패턴 생성
// ============================================================
function detectStyle(style: string): "miles" | "bebop" | "ballad" | "gospel" | "jazz" {
  const s = style.toLowerCase();
  if (s.includes("마일스") || s.includes("miles") || s.includes("cool")) return "miles";
  if (s.includes("비밥") || s.includes("bebop")) return "bebop";
  if (s.includes("발라드") || s.includes("ballad") || s.includes("slow")) return "ballad";
  if (s.includes("가스펠") || s.includes("gospel") || s.includes("소울")) return "gospel";
  return "jazz";
}

function getStyleRules(styleType: string): string {
  switch (styleType) {
    case "miles": return `MILES DAVIS STYLE: Very sparse. 2-3 notes per bar. Many half rests.
Example bars: [h,hr], [qr,h,q], [q,hr,q], [h,qr,q]`;
    case "bebop": return `BEBOP STYLE: Dense eighth notes. 6-8 per bar. Constant motion.
Example bars: [8,8,8,8,8,8,8,8], [8,8,8,8,q,q], [q,8,8,8,8,q]`;
    case "ballad": return `BALLAD STYLE: Long tones. Half or whole notes. Very sparse.
Example bars: [h,h], [w], [h,qr,q], [q,h,qr]`;
    case "gospel": return `GOSPEL STYLE: Soulful mix. Strong beats 2 and 4.
Example bars: [q,8,8,q,q], [8,8,q,8,8,q], [q,q,8,8,q]`;
    default: return `JAZZ STYLE: Mix of sparse and dense bars. Vary each bar.
Example bars: [q,8,8,h], [8,8,qr,h], [h,q,q], [8,8,8,8,q,q]`;
  }
}

function buildBarNotes(chord: string, barIndex: number, styleType: string): NoteEntry[] {
  const { chordTones: ct, passing: ps } = buildChordPalette(chord);
  const c0 = ct[0] ?? "c/4";
  const c1 = ct[1] ?? ct[0] ?? "e/4";
  const c2 = ct[2] ?? ct[0] ?? "g/4";
  const c3 = ct[3] ?? ct[1] ?? "b/4";
  const ps0 = ps[0] ?? "d/4";
  const ps1 = ps[1] ?? "a/4";

  const R = (dur: "qr" | "hr" | "8r"): NoteEntry => ({ keys: ["b/4"], duration: dur, chord });
  const N = (key: string, dur: "8" | "q" | "h"): NoteEntry => ({ keys: [key], duration: dur, chord });

  const milesPatterns: NoteEntry[][] = [
    [N(c1,"h"), R("hr")],
    [R("qr"), N(c0,"h"), R("qr")],
    [N(c2,"h"), R("qr"), N(c0,"q")],
    [R("hr"), N(c1,"q"), N(c0,"q")],
    [N(c0,"q"), R("hr"), N(c2,"q")],
    [R("qr"), N(c2,"h"), R("qr")],
    [N(c1,"h"), R("qr"), N(c2,"q")],
    [R("hr"), N(c0,"h")],
  ];

  const bebopPatterns: NoteEntry[][] = [
    [N(c0,"8"),N(ps0,"8"),N(c1,"8"),N(ps1,"8"),N(c2,"8"),N(ps0,"8"),N(c1,"8"),N(c0,"8")],
    [N(c1,"8"),N(c2,"8"),N(ps0,"8"),N(c3 ?? c1,"8"),N(c2,"8"),N(c1,"8"),N(ps1,"8"),N(c0,"8")],
    [N(c2,"8"),N(ps1,"8"),N(c1,"8"),N(c0,"8"),N(ps0,"8"),N(c1,"8"),N(c2,"q")],
    [N(c0,"8"),N(c1,"8"),N(c2,"8"),N(c3 ?? c2,"8"),N(c2,"8"),N(ps0,"8"),N(c1,"q")],
    [N(ps0,"8"),N(c0,"8"),N(c1,"8"),N(c2,"8"),N(c1,"8"),N(c0,"8"),N(ps1,"q")],
    [N(c3 ?? c2,"8"),N(c2,"8"),N(c1,"8"),N(ps0,"8"),N(c0,"8"),N(ps1,"8"),N(c2,"q")],
    [N(c1,"q"),N(c2,"8"),N(c3 ?? c2,"8"),N(c2,"8"),N(c1,"8"),N(ps0,"8"),N(c0,"8")],
    [N(c0,"8"),N(ps1,"8"),N(c1,"8"),N(c2,"8"),N(ps0,"8"),N(c3 ?? c2,"8"),N(c2,"q")],
  ];

  const balladPatterns: NoteEntry[][] = [
    [N(c1,"h"), N(c0,"h")],
    [N(c2,"h"), R("hr")],
    [R("qr"), N(c0,"h"), R("qr")],
    [N(c1,"h"), R("qr"), N(c2,"q")],
    [N(c0,"q"), N(c1,"h"), R("qr")],
    [R("hr"), N(c2,"h")],
    [N(c3 ?? c2,"h"), R("qr"), N(c0,"q")],
    [N(c0,"h"), N(c2,"h")],
  ];

  const jazzPatterns: NoteEntry[][] = [
    [N(c0,"q"),N(ps0,"8"),N(c1,"8"),N(c2,"h")],
    [R("qr"),N(c1,"q"),N(c2,"8"),N(ps0,"8"),N(c0,"q")],
    [N(c2,"8"),N(c1,"8"),R("qr"),N(c0,"h")],
    [N(c1,"h"),N(ps0,"8"),N(c2,"8"),R("qr")],
    [R("hr"),N(c0,"8"),N(c1,"8"),N(c2,"q")],
    [N(c0,"8"),N(ps1,"8"),N(c1,"q"),N(c2,"h")],
    [N(c2,"q"),R("qr"),N(c0,"8"),N(c1,"8"),R("qr")],
    [N(c1,"8"),N(c2,"8"),N(c1,"8"),N(c0,"8"),N(ps0,"h")],
  ];

  let patterns: NoteEntry[][];
  switch (styleType) {
    case "miles": patterns = milesPatterns; break;
    case "bebop": patterns = bebopPatterns; break;
    case "ballad": patterns = balladPatterns; break;
    default: patterns = jazzPatterns;
  }

  return patterns[barIndex % patterns.length];
}

// ============================================================
// API Route
// ============================================================
export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });

    const body = await request.json();
    const title = body.title?.trim() || "Untitled";
    const composer = body.composer?.trim() || "Unknown";
    const key = body.key?.trim() || "C major";
    const tempo = body.tempo?.trim() || "medium swing";
    const style = body.style?.trim() || "jazz";
    const totalBars = clamp(body.totalBars, 4, 64, 4);
    const barsPerLine = clamp(body.barsPerLine, 1, 8, 4);
    const chordProgression = body.chordProgression?.length ? body.chordProgression : ["Cmaj7","Am7","Dm7","G7"];
    const barChords = normalizeBarChords(body.barChords, chordProgression, totalBars);
    const sections = normalizeSections(body.sections, totalBars);
    const styleType = detectStyle(style);

    // 코드별 음표 팔레트 생성 (Claude 프롬프트용)
    const chordPaletteInfo = [...new Set(barChords.map(b => b.chord))].slice(0, 12).map(chord => {
      const { chordTones, passing } = buildChordPalette(chord);
      return `- ${chord}: chord tones [${chordTones.join(', ')}], passing [${passing.join(', ')}]`;
    }).join('\n');

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: "You are a JSON API for jazz adlib. Return ONLY valid JSON. No markdown, no explanation. First char {, last char }.",
        messages: [{
          role: "user",
          content: `Generate jazz adlib. key=${key}, style=${style}, totalBars=${totalBars}

barChords: ${JSON.stringify(barChords)}

CHORD TONES (use ONLY these notes per chord):
${chordPaletteInfo}

STYLE: ${getStyleRules(styleType)}

RULES:
- Each bar = exactly 4 beats (8=0.5, q=1, h=2, qr=1, hr=2, 8r=0.5)
- Rests: keys=["b/4"], duration="qr","hr","8r"
- Every bar MUST have different rhythm from adjacent bars
- Chord tones on beats 1 and 3
- Only use notes listed above for each chord

Return JSON:
{"title":"${title}","composer":"${composer}","key":"${key}","tempo":"${tempo}","timeSignature":"4/4","totalBars":${totalBars},"barsPerLine":${barsPerLine},"chordProgression":${JSON.stringify(chordProgression)},"barChords":${JSON.stringify(barChords)},"sections":${JSON.stringify(sections)},"notes":[{"keys":["f/4"],"duration":"h","chord":"Fmaj7"},{"keys":["b/4"],"duration":"hr","chord":"Fmaj7"}]}`
        }]
      })
    });

    if (!claudeResponse.ok) {
      console.error("Claude API failed:", await claudeResponse.text());
      return NextResponse.json(makeFallback({ title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections, styleType }));
    }

    const payload = await claudeResponse.json();
    const text = payload.content?.find((b: {type:string}) => b.type === "text")?.text;

    if (!text) {
      return NextResponse.json(makeFallback({ title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections, styleType }));
    }

    try {
      const parsed = parseJson(text);
      return NextResponse.json(withDefaults(parsed, { title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections }));
    } catch {
      console.error("JSON parse failed");
      return NextResponse.json(makeFallback({ title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections, styleType }));
    }
  } catch (error) {
    return NextResponse.json({ error: "Server error", message: String(error) }, { status: 500 });
  }
}

function makeFallback(p: { title:string; composer:string; key:string; tempo:string; totalBars:number; barsPerLine:number; chordProgression:string[]; barChords:BarChord[]; sections:ScoreSection[]; styleType:string }): MelodyResponse {
  const notes = p.barChords.flatMap((bc, i) => buildBarNotes(bc.chord, i, p.styleType));
  return { title:p.title, composer:p.composer, key:p.key, tempo:p.tempo, timeSignature:"4/4", totalBars:p.totalBars, barsPerLine:p.barsPerLine, chordProgression:p.chordProgression, barChords:p.barChords, sections:p.sections, notes, fallback:true };
}

function parseJson(text: string) {
  try { return JSON.parse(text); } catch {
    const s = text.indexOf("{"); const e = text.lastIndexOf("}");
    if (s === -1 || e <= s) throw new Error("No JSON");
    return JSON.parse(text.slice(s, e + 1));
  }
}

function withDefaults(melody: Partial<MelodyResponse>, d: { title:string; composer:string; key:string; tempo:string; totalBars:number; barsPerLine:number; chordProgression:string[]; barChords:BarChord[]; sections:ScoreSection[] }): MelodyResponse {
  return {
    title: melody.title ?? d.title,
    composer: melody.composer ?? d.composer,
    key: melody.key ?? d.key,
    tempo: melody.tempo ?? d.tempo,
    timeSignature: "4/4",
    totalBars: d.totalBars,
    barsPerLine: d.barsPerLine,
    chordProgression: d.barChords.map(e => e.chord),
    barChords: d.barChords,
    sections: d.sections,
    notes: melody.notes?.length ? melody.notes : [],
    fallback: melody.fallback
  };
}

function clamp(v: number | undefined, min: number, max: number, def: number) {
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.round(v as number)));
}

function normalizeBarChords(barChords: BarChord[] | undefined, chords: string[], total: number) {
  const map = new Map(barChords?.filter(e => e.bar >= 1).map(e => [e.bar, e.chord]) ?? []);
  return Array.from({ length: total }, (_, i) => ({ bar: i + 1, chord: map.get(i + 1) ?? chords[i % chords.length] ?? "Cmaj7" }));
}

function normalizeSections(sections: ScoreSection[] | undefined, total: number) {
  if (!sections?.length) return [{ label: "A", startBar: 1, endBar: total }];
  return sections.filter(s => s.label && s.startBar >= 1).map(s => ({
    label: s.label,
    startBar: Math.min(total, Math.max(1, Math.round(s.startBar))),
    endBar: s.endBar ? Math.min(total, Math.max(1, Math.round(s.endBar))) : undefined
  }));
}

export {};

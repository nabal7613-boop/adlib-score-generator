import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-sonnet-4-6";

type MelodyRequest = {
  title?: string;
  composer?: string;
  key?: string;
  tempo?: string;
  timeSignature?: string;
  totalBars?: number;
  barsPerLine?: number;
  chordProgression?: string[];
  barChords?: BarChord[];
  sections?: ScoreSection[];
  style?: string;
};

type BarChord = { bar: number; chord: string; };
type ScoreSection = { label: string; startBar: number; endBar?: number; };

type NoteEntry = {
  keys: string[];
  duration: "8" | "q" | "h" | "w" | "8r" | "qr" | "hr";
  chord: string;
};

type MelodyResponse = {
  title: string;
  composer: string;
  key: string;
  tempo: string;
  timeSignature: "4/4";
  totalBars: number;
  barsPerLine: number;
  chordProgression: string[];
  barChords: BarChord[];
  sections: ScoreSection[];
  notes: NoteEntry[];
  fallback?: boolean;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });

    const body = (await request.json()) as MelodyRequest;
    const title = body.title?.trim() || "Untitled";
    const composer = body.composer?.trim() || "Unknown";
    const key = body.key?.trim() || "C major";
    const tempo = body.tempo?.trim() || "medium swing";
    const style = body.style?.trim() || "jazz";
    const totalBars = clamp(body.totalBars, 4, 64, 4);
    const barsPerLine = clamp(body.barsPerLine, 1, 8, 4);
    const chordProgression = body.chordProgression?.length ? body.chordProgression : ["Cmaj7", "Am7", "Dm7", "G7"];
    const barChords = normalizeBarChords(body.barChords, chordProgression, totalBars);
    const sections = normalizeSections(body.sections, totalBars);

    // 스타일 분류
    const styleType = detectStyle(style);

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
        system: "You are a JSON API for jazz adlib composition. Return ONLY valid JSON. No markdown, no explanation, no code fences. First char must be {, last char must be }.",
        messages: [{
          role: "user",
          content: `Generate a jazz adlib for: key=${key}, style=${style}, totalBars=${totalBars}

barChords: ${JSON.stringify(barChords)}

STYLE RULES for "${styleType}":
${getStyleRules(styleType)}

CHORD NOTES:
- Cmaj7: c/4 e/4 g/4 b/4 (passing: d/4 a/4)
- E7: e/4 g#/4 b/4 d/5 (passing: f#/4)
- A7: a/4 c#/5 e/5 g/5 (passing: b/4)
- Dm/Dm7: d/4 f/4 a/4 c/5 (passing: e/4 g/4)
- G7: g/4 b/4 d/5 f/5 (passing: a/4)
- Am: a/4 c/5 e/5 g/5 (passing: b/4)
- D7: d/4 f#/4 a/4 c/5 (passing: e/4)
- F: f/4 a/4 c/5 (passing: g/4)
- Fm: f/4 ab/4 c/5 (passing: eb/4)
- Em7: e/4 g/4 b/4 d/5 (passing: f#/4)

RULES:
- Each bar = exactly 4 beats (8=0.5, q=1, h=2, qr=1, hr=2, 8r=0.5)
- Use keys: ["b/4"] for rests
- Every bar MUST be rhythmically different
- Use chord tones on beats 1 and 3
- Total bars must equal ${totalBars}

Return this JSON:
{
  "title": "${title}",
  "composer": "${composer}",
  "key": "${key}",
  "tempo": "${tempo}",
  "timeSignature": "4/4",
  "totalBars": ${totalBars},
  "barsPerLine": ${barsPerLine},
  "chordProgression": ${JSON.stringify(chordProgression)},
  "barChords": ${JSON.stringify(barChords)},
  "sections": ${JSON.stringify(sections)},
  "notes": [
    {"keys":["e/4"],"duration":"h","chord":"Cmaj7"},
    {"keys":["b/4"],"duration":"qr","chord":"Cmaj7"},
    {"keys":["g/4"],"duration":"q","chord":"Cmaj7"}
  ]
}`
        }]
      })
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();
      console.error("Claude API error:", detail);
      return NextResponse.json(createFallbackMelody({ title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections, styleType }));
    }

    const payload = await claudeResponse.json();
    const text = payload.content?.find((b: { type: string }) => b.type === "text")?.text;

    if (!text) {
      return NextResponse.json(createFallbackMelody({ title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections, styleType }));
    }

    try {
      const parsed = parseJson(text);
      return NextResponse.json(withDefaults(parsed, { title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections }));
    } catch {
      console.error("JSON parse failed, raw:", text.slice(0, 200));
      return NextResponse.json(createFallbackMelody({ title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections, styleType }));
    }
  } catch (error) {
    return NextResponse.json({ error: "Server error", message: String(error) }, { status: 500 });
  }
}

function detectStyle(style: string): "miles" | "bebop" | "ballad" | "gospel" | "jazz" {
  const s = style.toLowerCase();
  if (s.includes("마일스") || s.includes("miles") || s.includes("cool")) return "miles";
  if (s.includes("비밥") || s.includes("bebop")) return "bebop";
  if (s.includes("발라드") || s.includes("ballad") || s.includes("slow")) return "ballad";
  if (s.includes("가스펠") || s.includes("gospel") || s.includes("소울")) return "gospel";
  return "jazz";
}

function getStyleRules(style: string): string {
  switch (style) {
    case "miles": return `MILES DAVIS: Sparse. Max 3 notes per bar. Half notes and rests dominate.
Example bars: [h, hr], [qr, h, q], [h, qr, q], [q, hr, q]`;
    case "bebop": return `BEBOP: Dense. 6-8 eighth notes per bar. Constant motion.
Example bars: [8,8,8,8,8,8,8,8], [8,8,8,8,q,q], [8,8,8,8,8,8,q]`;
    case "ballad": return `BALLAD: Lyrical. Whole or half notes. Very sparse. 1-3 notes per bar.
Example bars: [w], [h, h], [h, qr, q], [q, h, qr]`;
    case "gospel": return `GOSPEL: Soulful. Mix of eighth and quarter notes. Strong beat 2 and 4.
Example bars: [q,8,8,q,q], [8,8,q,8,8,q], [q,q,8,8,q]`;
    default: return `JAZZ: Mix of sparse and dense bars. Vary each bar.
Example bars: [q,8,8,h], [8,8,qr,h], [h,q,q], [8,8,8,8,q,q]`;
  }
}

function parseJson(text: string) {
  try { return JSON.parse(text); } catch {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s === -1 || e <= s) throw new Error("No JSON found");
    return JSON.parse(text.slice(s, e + 1));
  }
}

// 스타일별 폴백 패턴
function createFallbackMelody(params: {
  title: string; composer: string; key: string; tempo: string;
  totalBars: number; barsPerLine: number; chordProgression: string[];
  barChords: BarChord[]; sections: ScoreSection[]; styleType: string;
}): MelodyResponse {
  const { title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections, styleType } = params;
  const notes = Array.from({ length: totalBars }, (_, i) => {
    const chord = barChords[i]?.chord ?? chordProgression[i % chordProgression.length] ?? "Cmaj7";
    return buildBarNotes(chord, i, styleType);
  }).flat();

  return { title, composer, key, tempo, timeSignature: "4/4", totalBars, barsPerLine, chordProgression, barChords, sections, notes, fallback: true };
}

function buildBarNotes(chord: string, barIndex: number, styleType: string): NoteEntry[] {
  const p = getChordPalette(chord);
  const R = (dur: "qr" | "hr" | "8r") => ({ keys: ["b/4"] as string[], duration: dur, chord });
  const N = (key: string, dur: "8" | "q" | "h") => ({ keys: [key], duration: dur, chord });

  const [c0, c1, c2, c3] = p.chordTones;
  const [ps0, ps1] = p.passing;

  // 스타일별 패턴 셋
  const milesPatterns: NoteEntry[][] = [
    [N(c1, "h"), R("hr")],
    [R("qr"), N(c0, "h"), R("qr")],
    [N(c2, "h"), R("qr"), N(c0, "q")],
    [R("hr"), N(c1, "q"), N(c0, "q")],
    [N(c0, "q"), R("hr"), N(c2, "q")],
    [R("qr"), N(c2, "h"), R("qr")],
    [N(c1, "h"), R("qr"), N(c2, "q")],
    [R("hr"), N(c0, "h")],
  ];

  const bebopPatterns: NoteEntry[][] = [
    [N(c0,"8"),N(ps0,"8"),N(c1,"8"),N(ps1,"8"),N(c2,"8"),N(ps0,"8"),N(c1,"8"),N(c0,"8")],
    [N(c1,"8"),N(c2,"8"),N(ps0,"8"),N(c3,"8"),N(c2,"8"),N(c1,"8"),N(ps1,"8"),N(c0,"8")],
    [N(c2,"8"),N(ps1,"8"),N(c1,"8"),N(c0,"8"),N(ps0,"8"),N(c1,"8"),N(c2,"q")],
    [N(c0,"8"),N(c1,"8"),N(c2,"8"),N(c3,"8"),N(c2,"8"),N(ps0,"8"),N(c1,"q")],
    [N(ps0,"8"),N(c0,"8"),N(c1,"8"),N(c2,"8"),N(c1,"8"),N(c0,"8"),N(ps1,"q")],
    [N(c3,"8"),N(c2,"8"),N(c1,"8"),N(ps0,"8"),N(c0,"8"),N(ps1,"8"),N(c2,"q")],
    [N(c1,"q"),N(c2,"8"),N(c3,"8"),N(c2,"8"),N(c1,"8"),N(ps0,"8"),N(c0,"8")],
    [N(c0,"8"),N(ps1,"8"),N(c1,"8"),N(c2,"8"),N(ps0,"8"),N(c3,"8"),N(c2,"q")],
  ];

  const balladPatterns: NoteEntry[][] = [
    [N(c1, "h"), N(c0, "h")],
    [N(c2, "h"), R("hr")],
    [R("qr"), N(c0, "h"), R("qr")],
    [N(c1, "h"), R("qr"), N(c2, "q")],
    [N(c0, "q"), N(c1, "h"), R("qr")],
    [R("hr"), N(c2, "h")],
    [N(c3, "h"), R("qr"), N(c0, "q")],
    [N(c0, "h"), N(c2, "h")],
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

function getChordPalette(chord: string) {
  const n = chord.toLowerCase().replace(/\s/g, "");
  if (n.startsWith("cmaj")) return { chordTones: ["c/4","e/4","g/4","b/4"], passing: ["d/4","a/4"] };
  if (n.startsWith("e7")) return { chordTones: ["e/4","g#/4","b/4","d/5"], passing: ["f#/4","c#/5"] };
  if (n.startsWith("a7")) return { chordTones: ["a/4","c#/5","e/5","g/5"], passing: ["b/4","f#/4"] };
  if (n.startsWith("am")) return { chordTones: ["a/4","c/5","e/5","g/5"], passing: ["b/4","d/5"] };
  if (n.startsWith("dm")) return { chordTones: ["d/4","f/4","a/4","c/5"], passing: ["e/4","g/4"] };
  if (n.startsWith("g7")) return { chordTones: ["g/4","b/4","d/5","f/5"], passing: ["a/4","e/4"] };
  if (n.startsWith("d7")) return { chordTones: ["d/4","f#/4","a/4","c/5"], passing: ["e/4","b/4"] };
  if (n.startsWith("em")) return { chordTones: ["e/4","g/4","b/4","d/5"], passing: ["f#/4","a/4"] };
  if (n.startsWith("fm")) return { chordTones: ["f/4","ab/4","c/5","eb/5"], passing: ["g/4","bb/4"] };
  if (n.startsWith("f")) return { chordTones: ["f/4","a/4","c/5","e/5"], passing: ["g/4","d/5"] };
  if (n.startsWith("c6")) return { chordTones: ["c/4","e/4","g/4","a/4"], passing: ["d/4","b/4"] };
  return { chordTones: ["c/4","e/4","g/4","b/4"], passing: ["d/4","a/4"] };
}

function withDefaults(melody: Partial<MelodyResponse>, d: {
  title: string; composer: string; key: string; tempo: string;
  totalBars: number; barsPerLine: number; chordProgression: string[];
  barChords: BarChord[]; sections: ScoreSection[];
}): MelodyResponse {
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

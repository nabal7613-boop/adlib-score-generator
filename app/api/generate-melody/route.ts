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

type BarChord = {
  bar: number;
  chord: string;
};

type ScoreSection = {
  label: string;
  startBar: number;
  endBar?: number;
};

type ClaudeTextBlock = {
  type: "text";
  text: string;
};

type ClaudeResponse = {
  content?: ClaudeTextBlock[];
};

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
  const requestId = crypto.randomUUID();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured.", requestId }, { status: 500 });
    }

    const body = (await request.json()) as MelodyRequest;
    const title = body.title?.trim() || "Untitled";
    const composer = body.composer?.trim() || "Unknown Composer";
    const key = body.key?.trim() || "C major";
    const tempo = body.tempo?.trim() || "medium swing";
    const timeSignature = body.timeSignature?.trim() || "4/4";
    const style = body.style?.trim() || "melodic jazz adlib";
    const totalBars = clampInteger(body.totalBars, 4, 64, 4);
    const barsPerLine = clampInteger(body.barsPerLine, 1, 8, 4);
    const chordProgression = body.chordProgression?.length ? body.chordProgression : ["Cmaj7", "Am7", "Dm7", "G7"];
    const barChords = normalizeBarChords(body.barChords, chordProgression, totalBars);
    const sections = normalizeSections(body.sections, totalBars);

    // 스타일 기반 리듬 지침 생성
    const styleGuidance = getStyleGuidance(style);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2500,
        temperature: 0.9,
        system:
          "You are a JSON API that composes jazz adlib melodies. Return exactly one valid JSON object and nothing else. No markdown, no code fences, no explanations.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Compose a jazz adlib melody.

INPUTS:
- key: ${key}
- tempo: ${tempo}
- style: ${style}
- totalBars: ${totalBars}
- barChords: ${JSON.stringify(barChords)}

STYLE GUIDANCE:
${styleGuidance}

RHYTHM RULES (CRITICAL):
- NEVER use the same rhythm pattern for adjacent bars
- Each bar must have a DIFFERENT combination of note durations
- Mix these durations: "8" (eighth), "q" (quarter), "h" (half), "qr" (quarter rest), "8r" (eighth rest), "hr" (half rest)
- Total beats per bar must equal exactly 4 quarter-note beats:
  * "w" = 4 beats
  * "h" = 2 beats, "hr" = 2 beats
  * "q" = 1 beat, "qr" = 1 beat
  * "8" = 0.5 beats, "8r" = 0.5 beats
- For rests: use keys ["b/4"] with duration "qr", "hr", or "8r"
- Example valid bars (4 beats each):
  * ["h", "qr", "q"] = 2+1+1 = 4 beats ✓
  * ["q", "8r", "8", "h"] = 1+0.5+0.5+2 = 4 beats ✓
  * ["8", "8", "qr", "h"] = 0.5+0.5+1+2 = 4 beats ✓
  * ["qr", "q", "q", "q"] = 1+1+1+1 = 4 beats ✓

CHORD-SCALE MAP:
- Cmaj7: C E G B (+ passing D A)
- E7: E G# B D (+ passing F#)
- A7: A C# E G (+ passing B)
- Dm/Dm7: D F A C (+ passing E G)
- G7: G B D F (+ passing A)
- Am/Am7: A C E G (+ passing B D)
- F: F A C (+ passing G)
- Fm: F Ab C (+ passing Eb)
- Em7: E G B D (+ passing F# A)

MUSICAL RULES:
- Put chord tones on beat 1 and beat 3
- Use passing tones on weak beats
- Notes range: c/4 to b/5 only
- Shape each bar differently: some bars sparse, some dense
- Create call-and-response between bars
- VexFlow note format: "c/4", "g#/4", "bb/4", "c#/5"

RETURN THIS EXACT JSON SCHEMA:
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
    { "keys": ["e/4"], "duration": "h", "chord": "Cmaj7" },
    { "keys": ["b/4"], "duration": "qr", "chord": "Cmaj7" },
    { "keys": ["g/4"], "duration": "q", "chord": "Cmaj7" }
  ]
}

Return JSON only. First char must be {. Last char must be }.`
              }
            ]
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();
      return NextResponse.json({ error: "Claude API failed.", detail }, { status: claudeResponse.status });
    }

    const payload = (await claudeResponse.json()) as ClaudeResponse;
    const text = payload.content?.find((block) => block.type === "text")?.text;

    if (!text) {
      return NextResponse.json({ error: "Claude returned no content." }, { status: 502 });
    }

    try {
      const melody = withLayoutDefaults(parseMelodyJson(text), {
        title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections
      });
      return NextResponse.json(melody);
    } catch {
      const fallback = createFallbackMelody({ title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections });
      return NextResponse.json(fallback);
    }
  } catch (error) {
    return NextResponse.json({ error: "Server error.", message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// 스타일별 리듬 지침
function getStyleGuidance(style: string): string {
  const s = style.toLowerCase();

  if (s.includes("마일스") || s.includes("miles") || s.includes("cool") || s.includes("쿨")) {
    return `MILES DAVIS STYLE:
- Very sparse: 2-4 notes per bar maximum
- Use lots of rests (half rests, quarter rests)
- Long tones (half notes) with space after
- Silence is as important as notes
- Example bar: [qr, h, q] or [h, hr] or [q, qr, h]`;
  }

  if (s.includes("비밥") || s.includes("bebop")) {
    return `BEBOP STYLE:
- Dense: 6-8 eighth notes per bar
- Fast chromatic runs with passing tones
- Minimal rests, constant motion
- Syncopated rhythms
- Example bar: [8,8,8,8,8,8,8,8] = 8 eighth notes`;
  }

  if (s.includes("발라드") || s.includes("ballad") || s.includes("slow")) {
    return `BALLAD STYLE:
- Very slow and lyrical
- Mostly half notes and quarter notes
- Long sustained tones
- Few notes per bar (2-3 maximum)
- Example bar: [h, q, qr] or [w] or [h, hr]`;
  }

  if (s.includes("가스펠") || s.includes("gospel") || s.includes("소울") || s.includes("soul")) {
    return `GOSPEL STYLE:
- Soulful and expressive
- Mix of eighth and quarter notes
- Emphasize the 2 and 4 beats
- Pentatonic emphasis
- Example bar: [q, 8, 8, q, q] or [8, 8, q, q, qr]`;
  }

  return `JAZZ ADLIB STYLE:
- Mix of sparse and dense bars
- Vary rhythm each bar: some use half notes, some use eighth notes
- Include rests for breathing space
- Shape phrases with peaks and valleys`;
}

function parseMelodyJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error("No JSON found in Claude response.");
    }
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }
}

// 개선된 폴백: 16가지 리듬 패턴, 코드별 음표
function createFallbackMelody(params: {
  title: string; composer: string; key: string; tempo: string;
  totalBars: number; barsPerLine: number; chordProgression: string[];
  barChords: BarChord[]; sections: ScoreSection[];
}): MelodyResponse {
  const { title, composer, key, tempo, totalBars, barsPerLine, chordProgression, barChords, sections } = params;
  const chords = chordProgression.length ? chordProgression : ["Cmaj7", "Am7", "Dm7", "G7"];
  const notes = Array.from({ length: totalBars }, (_, barIndex) => {
    const chord = barChords[barIndex]?.chord ?? chords[barIndex % chords.length] ?? "Cmaj7";
    return createBarNotes(chord, barIndex);
  }).flat();

  return { title, composer, key, tempo, timeSignature: "4/4", totalBars, barsPerLine, chordProgression, barChords, sections, fallback: true, notes };
}

// 16가지 리듬 패턴으로 마디마다 다른 리듬 생성
function createBarNotes(chord: string, barIndex: number): NoteEntry[] {
  const palette = getChordPalette(chord);
  const ct = palette.chordTones;
  const ps = palette.passing;

  const n = (name: string, oct = 4) => toVexKey(name, oct);
  const rest = (dur: "qr" | "hr" | "8r") => ({ keys: ["b/4"], duration: dur, chord });
  const note = (name: string, dur: "8" | "q" | "h", oct = 4) => ({ keys: [n(name, oct)], duration: dur, chord });

  // 16가지 완전히 다른 패턴
  const patterns: NoteEntry[][] = [
    // 0: 롱톤 시작 + 쉼표
    [note(ct[0], "h"), rest("qr"), note(ct[1], "q")],
    // 1: 쉼표 시작 + 멜로디
    [rest("qr"), note(ct[2], "q"), note(ct[1], "h")],
    // 2: 비밥 런
    [note(ct[0], "8"), note(ps[0], "8"), note(ct[1], "8"), note(ps[1] || ct[2], "8"), note(ct[2], "q"), note(ct[3] || ct[0], "q")],
    // 3: 마일스 스타일 (매우 sparse)
    [rest("hr"), note(ct[1], "q"), note(ct[0], "q")],
    // 4: 싱코페이션
    [note(ct[1], "8"), rest("8r"), note(ct[2], "q"), note(ps[0], "8"), note(ct[0], "8"), rest("qr")],
    // 5: 상행 멜로디
    [note(ct[0], "q"), note(ct[1], "q"), note(ct[2], "q"), note(ct[3] || ct[0], "q", 5)],
    // 6: 하행 + 쉼표
    [note(ct[3] || ct[2], "q", 5), note(ct[2], "8"), note(ct[1], "8"), rest("hr")],
    // 7: 콜 앤 리스폰스
    [note(ct[0], "8"), note(ct[1], "8"), rest("qr"), note(ct[2], "8"), note(ct[1], "8"), rest("qr")],
    // 8: 하프노트 중심
    [note(ct[2], "h"), note(ct[0], "h")],
    // 9: 8분음표 + 쉼표 교대
    [note(ct[1], "8"), rest("8r"), note(ct[2], "8"), rest("8r"), note(ct[0], "h")],
    // 10: 점음표 느낌 (q+8+8+q)
    [note(ct[0], "q"), note(ps[0], "8"), note(ct[1], "8"), note(ct[2], "q"), note(ps[1] || ct[3] || ct[0], "q")],
    // 11: 큰 쉼표 후 빠른 패시지
    [rest("hr"), note(ct[1], "8"), note(ct[2], "8"), note(ct[1], "8"), note(ct[0], "8")],
    // 12: 옥타브 점프
    [note(ct[0], "q"), note(ct[0], "q", 5), rest("hr")],
    // 13: 타이 느낌 (h+q+q)
    [note(ct[2], "h"), rest("qr"), note(ct[1], "q")],
    // 14: 텐션 빌드업
    [note(ps[0], "8"), note(ct[0], "8"), note(ps[1] || ct[1], "8"), note(ct[1], "8"), note(ct[2], "h")],
    // 15: 레졸브
    [note(ct[3] || ct[2], "q", 5), note(ct[2], "8"), note(ct[1], "8"), note(ct[0], "h")]
  ];

  return patterns[barIndex % patterns.length];
}

function getChordPalette(chord: string) {
  const normalized = chord.toLowerCase().replace(/\s+/g, "").replace(/△/, "maj");

  if (normalized.startsWith("cmaj")) return { chordTones: ["C", "E", "G", "B"], passing: ["D", "A"] };
  if (normalized.startsWith("e7")) return { chordTones: ["E", "G#", "B", "D"], passing: ["F#", "C#"] };
  if (normalized.startsWith("a7")) return { chordTones: ["A", "C#", "E", "G"], passing: ["B", "F#"] };
  if (normalized.startsWith("am")) return { chordTones: ["A", "C", "E", "G"], passing: ["B", "D"] };
  if (normalized.startsWith("dm")) return { chordTones: ["D", "F", "A", "C"], passing: ["E", "G"] };
  if (normalized.startsWith("g7")) return { chordTones: ["G", "B", "D", "F"], passing: ["A", "E"] };
  if (normalized.startsWith("d7")) return { chordTones: ["D", "F#", "A", "C"], passing: ["E", "B"] };
  if (normalized.startsWith("em")) return { chordTones: ["E", "G", "B", "D"], passing: ["F#", "A"] };
  if (normalized.startsWith("fm")) return { chordTones: ["F", "Ab", "C", "Eb"], passing: ["G", "Bb"] };
  if (normalized.startsWith("f")) return { chordTones: ["F", "A", "C", "E"], passing: ["G", "D"] };
  if (normalized.startsWith("c6")) return { chordTones: ["C", "E", "G", "A"], passing: ["D", "B"] };

  return { chordTones: ["C", "E", "G", "B"], passing: ["D", "A"] };
}

function toVexKey(note: string, octave: number): string {
  const map: Record<string, string> = {
    "C#": "c#", "Db": "db", "D#": "d#", "Eb": "eb",
    "F#": "f#", "Gb": "gb", "G#": "g#", "Ab": "ab",
    "A#": "a#", "Bb": "bb", "B#": "b#", "Cb": "cb"
  };
  const normalized = map[note] ?? note.toLowerCase();
  return `${normalized}/${Math.min(5, Math.max(4, octave))}`;
}

function withLayoutDefaults(melody: Partial<MelodyResponse>, defaults: {
  title: string; composer: string; key: string; tempo: string;
  totalBars: number; barsPerLine: number; chordProgression: string[];
  barChords: BarChord[]; sections: ScoreSection[];
}): MelodyResponse {
  const chordProgression = melody.chordProgression?.length === defaults.totalBars
    ? melody.chordProgression
    : defaults.barChords.map((e) => e.chord);

  return {
    title: melody.title ?? defaults.title,
    composer: melody.composer ?? defaults.composer,
    key: melody.key ?? defaults.key,
    tempo: melody.tempo ?? defaults.tempo,
    timeSignature: "4/4",
    totalBars: defaults.totalBars,
    barsPerLine: defaults.barsPerLine,
    chordProgression,
    barChords: defaults.barChords,
    sections: defaults.sections,
    notes: melody.notes?.length ? melody.notes : createFallbackMelody(defaults).notes,
    fallback: melody.fallback
  };
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value as number)));
}

function normalizeBarChords(barChords: BarChord[] | undefined, chordProgression: string[], totalBars: number) {
  const chords = chordProgression.length ? chordProgression : ["Cmaj7"];
  const byBar = new Map(barChords?.filter((e) => e.bar >= 1 && e.chord).map((e) => [e.bar, e.chord]) ?? []);
  return Array.from({ length: totalBars }, (_, index) => ({
    bar: index + 1,
    chord: byBar.get(index + 1) ?? chords[index % chords.length] ?? "Cmaj7"
  }));
}

function normalizeSections(sections: ScoreSection[] | undefined, totalBars: number) {
  if (!sections?.length) return [{ label: "A", startBar: 1, endBar: totalBars }];
  return sections
    .filter((s) => s.label && s.startBar >= 1)
    .map((s) => ({
      label: s.label,
      startBar: Math.min(totalBars, Math.max(1, Math.round(s.startBar))),
      endBar: s.endBar ? Math.min(totalBars, Math.max(1, Math.round(s.endBar))) : undefined
    }));
}

export {};

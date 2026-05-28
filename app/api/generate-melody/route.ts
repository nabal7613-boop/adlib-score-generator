import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-opus-4-6";

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
  notes: Array<{
    keys: string[];
    duration: "8" | "q" | "h";
    chord: string;
  }>;
  fallback?: boolean;
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error("[api/generate-melody] Missing Anthropic API key", {
        requestId,
        envKey: "ANTHROPIC_API_KEY"
      });

      return NextResponse.json(
        {
          error: "ANTHROPIC_API_KEY environment variable is not configured.",
          requestId
        },
        { status: 500 }
      );
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
    const chordProgression = body.chordProgression?.length
      ? body.chordProgression
      : ["Cmaj7", "Am7", "Dm7", "G7"];
    const barChords = normalizeBarChords(body.barChords, chordProgression, totalBars);
    const sections = normalizeSections(body.sections, totalBars);

    console.info("[api/generate-melody] Starting Claude melody generation", {
      requestId,
      model: CLAUDE_MODEL,
      key,
      tempo,
      totalBars,
      barsPerLine,
      style,
      chordProgression,
      barChords,
      sections
    });

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1800,
        temperature: 0.85,
        system:
          "You are a JSON API that composes short jazz adlib melodies for VexFlow. You must return exactly one valid JSON object and nothing else. Do not use markdown, code fences, explanations, comments, trailing commas, or prose before or after the JSON.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Create a short adlib melody for a score analysis.

Inputs:
- key: ${key}
- tempo: ${tempo}
- timeSignature: ${timeSignature}
- title: ${title}
- composer: ${composer}
- totalBars: ${totalBars}
- barsPerLine: ${barsPerLine}
- chordProgression: ${JSON.stringify(chordProgression)}
- barChords: ${JSON.stringify(barChords)}
- sections: ${JSON.stringify(sections)}
- style: ${style}

CHORD-SCALE MAP:
- Cmaj7: choose from C D E G A B. Emphasize chord tones C E G B; use D/A as passing or color tones.
- E7: choose from E F# G# B D. Emphasize E G# B D; use F# as passing tone.
- A7: choose from A B C# E G. Emphasize A C# E G; use B as passing tone.
- Dm or Dm7: choose from D E F G A C. Emphasize D F A C; use E/G as passing tones.
- G7: choose from G A B D F. Emphasize G B D F; use A as passing tone.
- For any other chord, infer a close chord-scale and keep strong beats on chord tones.

STRICT OUTPUT CONTRACT:
- Your entire response must be parseable by JSON.parse().
- The first character must be "{".
- The last character must be "}".
- Do not wrap the JSON in markdown.
- Do not include any sentence such as "Here is the JSON".
- Do not include comments.
- Do not include trailing commas.
- Do not include extra keys outside this schema.

Return exactly this JSON schema:
{
  "title": "string",
  "composer": "string",
  "key": "string",
  "tempo": "string",
  "timeSignature": "4/4",
  "totalBars": 16,
  "barsPerLine": 4,
  "chordProgression": ["Cmaj7", "E7", "A7", "Dm7"],
  "barChords": [{ "bar": 1, "chord": "Cmaj7" }],
  "sections": [{ "label": "A", "startBar": 1, "endBar": 8 }],
  "notes": [
    { "keys": ["c/4"], "duration": "q", "chord": "Cmaj7" }
  ]
}

Rules:
- Preserve title, composer, totalBars, barsPerLine, barChords, and sections exactly from the inputs.
- Generate a fresh adlib melody for the full chord progression. Do not repeat the same first four bars.
- Generate enough notes to fill totalBars bars in 4/4.
- The total duration must equal exactly totalBars * 4 quarter-note beats.
- Return chordProgression as one chord symbol per bar, matching barChords order.
- Use VexFlow-compatible note keys like "c/4", "d#/4", "bb/4", "g/5".
- Use VexFlow-compatible durations only: "8", "q", "h".
- Every note object must include "keys", "duration", and "chord".
- The "chord" value for each note must match the chord for its current 4/4 bar.
- Compose each bar from the note pool that matches that bar's chord.
- Make every bar rhythmically or melodically different from adjacent bars.
- Use swing phrasing: mostly eighth notes, occasional quarter notes, and short syncopated cells.
- Put chord tones on strong beats 1 and 3 when possible.
- Mix passing notes between chord tones, but avoid random scale runs.
- Shape phrases with contour, call-and-response, and resolution into the next bar.
- Keep notes readable on treble clef between c/4 and c/6.
- Reflect the requested style in contour and rhythm.
- Return JSON only.`
              }
            ]
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();

      console.error("[api/generate-melody] Claude API request failed", {
        requestId,
        model: CLAUDE_MODEL,
        status: claudeResponse.status,
        statusText: claudeResponse.statusText,
        anthropicRequestId: claudeResponse.headers.get("request-id"),
        detail
      });

      return NextResponse.json(
        {
          error: "Claude melody generation failed.",
          requestId,
          model: CLAUDE_MODEL,
          status: claudeResponse.status,
          statusText: claudeResponse.statusText,
          anthropicRequestId: claudeResponse.headers.get("request-id"),
          detail
        },
        { status: claudeResponse.status }
      );
    }

    const payload = (await claudeResponse.json()) as ClaudeResponse;
    const text = payload.content?.find((block) => block.type === "text")?.text;

    if (!text) {
      console.error("[api/generate-melody] Claude returned no text content", {
        requestId,
        model: CLAUDE_MODEL,
        payload
      });

      return NextResponse.json(
        {
          error: "Claude did not return a melody result.",
          requestId,
          payload
        },
        { status: 502 }
      );
    }

    try {
      const melody = withLayoutDefaults(parseMelodyJson(text), {
        title,
        composer,
        key,
        tempo,
        totalBars,
        barsPerLine,
        chordProgression,
        barChords,
        sections
      });

      console.info("[api/generate-melody] Claude melody generation completed", {
        requestId,
        model: CLAUDE_MODEL
      });

      return NextResponse.json(melody);
    } catch (parseError) {
      const fallback = createFallbackMelody({
        title,
        composer,
        key,
        tempo,
        totalBars,
        barsPerLine,
        chordProgression,
        barChords,
        sections
      });

      console.error("[api/generate-melody] Claude returned invalid JSON, using fallback melody", {
        requestId,
        model: CLAUDE_MODEL,
        parseError,
        raw: text,
        fallback
      });

      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error("[api/generate-melody] Unexpected server error", {
      requestId,
      model: CLAUDE_MODEL,
      error
    });

    return NextResponse.json(
      {
        error: "Unexpected server error while generating melody.",
        requestId,
        message: error instanceof Error ? error.message : String(error),
        stack:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.stack
            : undefined
      },
      { status: 500 }
    );
  }
}

function parseMelodyJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error("No JSON object found in Claude response.");
    }

    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }
}

function createFallbackMelody({
  title,
  composer,
  key,
  tempo,
  totalBars,
  barsPerLine,
  chordProgression,
  barChords,
  sections
}: {
  title: string;
  composer: string;
  key: string;
  tempo: string;
  totalBars: number;
  barsPerLine: number;
  chordProgression: string[];
  barChords: BarChord[];
  sections: ScoreSection[];
}): MelodyResponse {
  const chords = chordProgression.length ? chordProgression : ["Cmaj7", "Am7", "Dm7", "G7"];
  const notes = Array.from({ length: totalBars }, (_, barIndex) => {
    const chord = barChords[barIndex]?.chord ?? chords[barIndex % chords.length] ?? "Cmaj7";
    return createBarNotes(chord, barIndex);
  }).flat();

  return {
    title,
    composer,
    key,
    tempo,
    timeSignature: "4/4",
    totalBars,
    barsPerLine,
    chordProgression: Array.from(
      { length: totalBars },
      (_, index) => barChords[index]?.chord ?? chords[index % chords.length] ?? "Cmaj7"
    ),
    barChords,
    sections,
    fallback: true,
    notes
  };
}

function createBarNotes(chord: string, barIndex: number): MelodyResponse["notes"] {
  const palette = getChordPalette(chord);
  const octaveShift = barIndex % 3 === 2 ? 1 : 0;
  const note = (name: string, octave = 4) => toVexKey(name, octave + octaveShift);
  const root = note(palette.chordTones[0]);
  const third = note(palette.chordTones[1] ?? palette.scale[1]);
  const fifth = note(palette.chordTones[2] ?? palette.scale[2]);
  const seventh = note(palette.chordTones[3] ?? palette.scale[3], octaveShift ? 4 : 5);
  const passA = note(palette.passing[0] ?? palette.scale[1]);
  const passB = note(palette.passing[1] ?? palette.scale[2]);

  const patterns: Array<Array<{ key: string; duration: "8" | "q"; chord: string }>> = [
    [
      { key: root, duration: "8", chord },
      { key: passA, duration: "8", chord },
      { key: third, duration: "q", chord },
      { key: fifth, duration: "8", chord },
      { key: seventh, duration: "8", chord },
      { key: fifth, duration: "q", chord }
    ],
    [
      { key: third, duration: "q", chord },
      { key: fifth, duration: "8", chord },
      { key: passB, duration: "8", chord },
      { key: seventh, duration: "q", chord },
      { key: fifth, duration: "8", chord },
      { key: third, duration: "8", chord }
    ],
    [
      { key: fifth, duration: "8", chord },
      { key: seventh, duration: "8", chord },
      { key: passA, duration: "8", chord },
      { key: third, duration: "8", chord },
      { key: root, duration: "q", chord },
      { key: passB, duration: "q", chord }
    ],
    [
      { key: seventh, duration: "q", chord },
      { key: fifth, duration: "8", chord },
      { key: third, duration: "8", chord },
      { key: passA, duration: "q", chord },
      { key: root, duration: "8", chord },
      { key: third, duration: "8", chord }
    ]
  ];

  return patterns[barIndex % patterns.length].map((entry) => ({
    keys: [entry.key],
    duration: entry.duration,
    chord: entry.chord
  }));
}

function getChordPalette(chord: string) {
  const normalized = chord.toLowerCase().replace(/\s+/g, "");

  if (normalized.startsWith("cmaj7") || normalized.startsWith("cmaj")) {
    return {
      scale: ["C", "D", "E", "G", "A", "B"],
      chordTones: ["C", "E", "G", "B"],
      passing: ["D", "A"]
    };
  }

  if (normalized.startsWith("e7")) {
    return {
      scale: ["E", "F#", "G#", "B", "D"],
      chordTones: ["E", "G#", "B", "D"],
      passing: ["F#"]
    };
  }

  if (normalized.startsWith("a7")) {
    return {
      scale: ["A", "B", "C#", "E", "G"],
      chordTones: ["A", "C#", "E", "G"],
      passing: ["B"]
    };
  }

  if (normalized.startsWith("dm")) {
    return {
      scale: ["D", "E", "F", "G", "A", "C"],
      chordTones: ["D", "F", "A", "C"],
      passing: ["E", "G"]
    };
  }

  if (normalized.startsWith("g7")) {
    return {
      scale: ["G", "A", "B", "D", "F"],
      chordTones: ["G", "B", "D", "F"],
      passing: ["A"]
    };
  }

  return {
    scale: ["C", "D", "E", "G", "A", "B"],
    chordTones: ["C", "E", "G", "B"],
    passing: ["D", "A"]
  };
}

function toVexKey(note: string, octave: number) {
  const normalized = note
    .replace("#", "#")
    .replace("b", "b")
    .toLowerCase();

  return `${normalized}/${Math.min(5, Math.max(4, octave))}`;
}

function withLayoutDefaults(
  melody: Partial<MelodyResponse>,
  defaults: {
    title: string;
    composer: string;
    key: string;
    tempo: string;
    totalBars: number;
    barsPerLine: number;
    chordProgression: string[];
    barChords: BarChord[];
    sections: ScoreSection[];
  }
): MelodyResponse {
  const chordProgression =
    melody.chordProgression?.length === defaults.totalBars
      ? melody.chordProgression
      : defaults.barChords.map((entry) => entry.chord);

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
    notes: melody.notes?.length
      ? melody.notes
      : createFallbackMelody(defaults).notes,
    fallback: melody.fallback
  };
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value as number)));
}

function normalizeBarChords(
  barChords: BarChord[] | undefined,
  chordProgression: string[],
  totalBars: number
) {
  const chords = chordProgression.length ? chordProgression : ["Cmaj7"];
  const byBar = new Map(
    barChords
      ?.filter((entry) => entry.bar >= 1 && entry.chord)
      .map((entry) => [entry.bar, entry.chord]) ?? []
  );

  return Array.from({ length: totalBars }, (_, index) => ({
    bar: index + 1,
    chord: byBar.get(index + 1) ?? chords[index % chords.length] ?? "Cmaj7"
  }));
}

function normalizeSections(sections: ScoreSection[] | undefined, totalBars: number) {
  if (!sections?.length) {
    return [{ label: "A", startBar: 1, endBar: totalBars }];
  }

  return sections
    .filter((section) => section.label && section.startBar >= 1)
    .map((section) => ({
      label: section.label,
      startBar: Math.min(totalBars, Math.max(1, Math.round(section.startBar))),
      endBar: section.endBar
        ? Math.min(totalBars, Math.max(1, Math.round(section.endBar)))
        : undefined
    }));
}

export {};

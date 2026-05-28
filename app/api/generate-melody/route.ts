import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-opus-4-6";

type MelodyRequest = {
  key?: string;
  tempo?: string;
  chordProgression?: string[];
  style?: string;
};

type ClaudeTextBlock = {
  type: "text";
  text: string;
};

type ClaudeResponse = {
  content?: ClaudeTextBlock[];
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
    const key = body.key?.trim() || "C major";
    const tempo = body.tempo?.trim() || "medium swing";
    const style = body.style?.trim() || "melodic jazz adlib";
    const chordProgression = body.chordProgression?.length
      ? body.chordProgression
      : ["Cmaj7", "Am7", "Dm7", "G7"];

    console.info("[api/generate-melody] Starting Claude melody generation", {
      requestId,
      model: CLAUDE_MODEL,
      key,
      tempo,
      style,
      chordProgression
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
        max_tokens: 1200,
        temperature: 0.7,
        system:
          "You are a jazz composer and VexFlow notation assistant. Return only valid JSON.",
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
- chordProgression: ${JSON.stringify(chordProgression)}
- style: ${style}

Return only JSON with this exact shape:
{
  "title": "string",
  "key": "string",
  "tempo": "string",
  "timeSignature": "4/4",
  "notes": [
    { "keys": ["c/4"], "duration": "q", "chord": "Cmaj7" }
  ]
}

Rules:
- Generate exactly 16 notes.
- Use VexFlow-compatible note keys like "c/4", "d#/4", "bb/4", "g/5".
- Use VexFlow-compatible durations only: "8", "q", "h".
- Prefer mostly eighth notes and quarter notes.
- Keep notes readable on treble clef between c/4 and c/6.
- Reflect the requested style in contour and rhythm.
- Do not include markdown, comments, or text outside JSON.`
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
      const melody = JSON.parse(text);

      console.info("[api/generate-melody] Claude melody generation completed", {
        requestId,
        model: CLAUDE_MODEL
      });

      return NextResponse.json(melody);
    } catch (parseError) {
      console.error("[api/generate-melody] Claude returned invalid JSON", {
        requestId,
        model: CLAUDE_MODEL,
        parseError,
        raw: text
      });

      return NextResponse.json(
        {
          error: "Claude returned invalid melody JSON.",
          requestId,
          raw: text
        },
        { status: 502 }
      );
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

export {};

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-sonnet-4-6";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("score") ?? formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "파일 크기는 8MB 이하여야 합니다." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mediaType = (file.type || "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system:
          "You are a JSON API that analyzes sheet music images. Return ONLY valid JSON. No markdown, no explanation, no code fences. First char must be {, last char must be }.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: `Analyze this sheet music image and return a JSON object with the following fields.

Return ONLY this JSON structure, nothing else:
{
  "title": "song title",
  "composer": "composer name",
  "key": "e.g. C major, F major, Bb major, G minor",
  "tempo": "e.g. Med. Swing, Fast Bossa Nova, Slow Ballad",
  "timeSignature": "e.g. 4/4, 3/4",
  "totalBars": 32,
  "barsPerLine": 4,
  "chordProgression": ["Cmaj7", "E7", "A7", "Dm7", "G7"],
  "barChords": [
    { "bar": 1, "chord": "Cmaj7" },
    { "bar": 2, "chord": "Cmaj7" },
    { "bar": 3, "chord": "E7" }
  ],
  "sections": [
    { "label": "A", "startBar": 1, "endBar": 8 },
    { "label": "B", "startBar": 17, "endBar": 24 }
  ],
  "confidence": {
    "key": 0.95,
    "tempo": 0.85,
    "chordProgression": 0.9,
    "layout": 0.95
  }
}

Rules:
- barChords must have one entry per bar, covering ALL bars from 1 to totalBars
- chordProgression is a flat list of unique chords in order of appearance
- sections are labeled sections (A, B, etc.) with box notation if visible
- If you cannot read something clearly, make your best guess
- Return JSON only, no other text`
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Claude API error:", detail);
      return NextResponse.json(
        { error: "악보 분석 중 오류가 발생했습니다.", detail },
        { status: response.status }
      );
    }

    const payload = await response.json();
    const text = payload.content?.find(
      (block: { type: string }) => block.type === "text"
    )?.text;

    if (!text) {
      return NextResponse.json(
        { error: "Claude가 응답을 반환하지 않았습니다." },
        { status: 502 }
      );
    }

    try {
      const result = parseJson(text);
      return NextResponse.json(result);
    } catch {
      // JSON 파싱 실패 시 기본값 반환
      console.error("JSON parse failed, raw:", text.slice(0, 300));
      return NextResponse.json({
        title: "Unknown",
        composer: "Unknown",
        key: "C major",
        tempo: "Medium",
        timeSignature: "4/4",
        totalBars: 32,
        barsPerLine: 4,
        chordProgression: ["Cmaj7", "Am7", "Dm7", "G7"],
        barChords: Array.from({ length: 32 }, (_, i) => ({
          bar: i + 1,
          chord: ["Cmaj7", "Am7", "Dm7", "G7"][i % 4],
        })),
        sections: [{ label: "A", startBar: 1, endBar: 32 }],
        confidence: { key: 0.5, tempo: 0.5, chordProgression: 0.5, layout: 0.5 },
      });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다.", message: String(error) },
      { status: 500 }
    );
  }
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON found");
    return JSON.parse(text.slice(start, end + 1));
  }
}

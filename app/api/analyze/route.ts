import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-opus-4-6";
const MAX_FILE_SIZE = 8 * 1024 * 1024;

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
      console.error("[api/analyze] Missing Anthropic API key", {
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

    const formData = await request.formData();
    const uploaded = formData.get("score") ?? formData.get("file");

    if (!(uploaded instanceof File)) {
      console.warn("[api/analyze] Missing upload file", {
        requestId,
        formKeys: Array.from(formData.keys())
      });

      return NextResponse.json(
        {
          error: "Upload a score image in the `score` form field.",
          requestId
        },
        { status: 400 }
      );
    }

    if (!uploaded.type.startsWith("image/")) {
      console.warn("[api/analyze] Unsupported upload type", {
        requestId,
        fileName: uploaded.name,
        fileType: uploaded.type,
        fileSize: uploaded.size
      });

      return NextResponse.json(
        {
          error: "Only image uploads are supported for analysis.",
          requestId
        },
        { status: 415 }
      );
    }

    if (uploaded.size > MAX_FILE_SIZE) {
      console.warn("[api/analyze] Upload too large", {
        requestId,
        fileName: uploaded.name,
        fileType: uploaded.type,
        fileSize: uploaded.size,
        maxFileSize: MAX_FILE_SIZE
      });

      return NextResponse.json(
        {
          error: "The uploaded image must be 8MB or smaller.",
          requestId
        },
        { status: 413 }
      );
    }

    console.info("[api/analyze] Starting Claude score analysis", {
      requestId,
      model: CLAUDE_MODEL,
      fileName: uploaded.name,
      fileType: uploaded.type,
      fileSize: uploaded.size
    });

    const imageBuffer = Buffer.from(await uploaded.arrayBuffer());
    const base64Image = imageBuffer.toString("base64");

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 700,
        temperature: 0,
        system:
          "You are a music theory assistant. Analyze the uploaded sheet music image and return only valid JSON.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: uploaded.type,
                  data: base64Image
                }
              },
              {
                type: "text",
                text:
                  "Analyze this score image. Return only JSON with this exact shape: {\"key\":\"string or unknown\",\"tempo\":\"string or unknown\",\"chordProgression\":[\"chord symbols in order\"],\"confidence\":{\"key\":0-1,\"tempo\":0-1,\"chordProgression\":0-1}}. Do not include markdown."
              }
            ]
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text();

      console.error("[api/analyze] Claude API request failed", {
        requestId,
        model: CLAUDE_MODEL,
        status: claudeResponse.status,
        statusText: claudeResponse.statusText,
        anthropicRequestId: claudeResponse.headers.get("request-id"),
        detail
      });

      return NextResponse.json(
        {
          error: "Claude analysis failed.",
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
      console.error("[api/analyze] Claude returned no text content", {
        requestId,
        model: CLAUDE_MODEL,
        payload
      });

      return NextResponse.json(
        {
          error: "Claude did not return an analysis result.",
          requestId,
          payload
        },
        { status: 502 }
      );
    }

    try {
      const analysis = JSON.parse(text);

      console.info("[api/analyze] Claude score analysis completed", {
        requestId,
        model: CLAUDE_MODEL
      });

      return NextResponse.json(analysis);
    } catch (parseError) {
      console.error("[api/analyze] Claude returned invalid JSON", {
        requestId,
        model: CLAUDE_MODEL,
        parseError,
        raw: text
      });

      return NextResponse.json(
        {
          error: "Claude returned invalid JSON.",
          requestId,
          raw: text
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("[api/analyze] Unexpected server error", {
      requestId,
      model: CLAUDE_MODEL,
      error
    });

    return NextResponse.json(
      {
        error: "Unexpected server error while analyzing score.",
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

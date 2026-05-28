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

type MelodyResponse = {
  title: string;
  key: string;
  tempo: string;
  timeSignature: "4/4";
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
- chordProgression: ${JSON.stringify(chordProgression)}
- style: ${style}

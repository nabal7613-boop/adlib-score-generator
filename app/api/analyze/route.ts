import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('score') || formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: '이미지가 필요합니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mediaType = file.type || 'image/jpeg';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: '이 악보를 분석해서 JSON으로만 답해줘. {"key": "C Major", "tempo": "Med. Swing", "chordProgression": ["Cmaj7", "E7", "Am"], "confidence": 0.95} 이 형식으로.',
          },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    return NextResponse.json(result);

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '분석 오류' }, { status: 500 });
  }
}

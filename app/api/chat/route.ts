import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { findBestContext } from '@/lib/contextLoader';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }

    // 1. Find the best matching context file
    const context = findBestContext(message);

    // 2. Build the prompt
    const prompt = `You are FINSA AI, a helpful assistant for the Finance Students' Association (FINSA).
Use the context below to answer the user's question accurately and concisely.
If the context does not cover the question, answer using general knowledge but stay relevant to finance and student life.

--- CONTEXT ---
${context}
--- END CONTEXT ---

User: ${message}
Assistant:`;

    // 3. Call Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 200, // keeps responses short
          temperature: 0.7,
        },
      });
    const response = result.response.text();

    return NextResponse.json({ reply: response });
  } catch (error) {
    console.error('[Chat API Error]', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
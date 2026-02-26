import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getContextForQuery } from '@/lib/contextLoader';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

type ChatMessage = { role: 'user' | 'ai'; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = typeof body.message === 'string' ? body.message : undefined;
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];

    const lastUserMessage = message ?? messages.filter((m) => m.role === 'user').pop()?.content;
    if (!lastUserMessage || typeof lastUserMessage !== 'string') {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }

    // 1. Get relevant context (multi-file) and source names for attribution
    const { content: context, sources } = getContextForQuery(lastUserMessage);

    // 2. System instruction: who the assistant is + the knowledge base (context)
    const systemInstruction = `You are FINSA AI, a helpful assistant for the Finance Students' Association (FINSA).
Use ONLY the context below to answer the user's question. Be accurate and concise.
If the context does not contain enough information, say so and suggest they check the FINSA website or contact financeclub.sfu@gmail.com.
Do not make up details (dates, names, policies). Stay on topic and professional.

--- CONTEXT ---
${context || '(No specific context matched; use general FINSA knowledge and suggest checking the website for details.)'}
--- END CONTEXT ---`;

    // 3. Build conversation history for Gemini (user / model turns)
    const contents: { role: 'user' | 'model'; parts: [{ text: string }] }[] = [];
    const history = messages.length > 0 ? messages : [{ role: 'user' as const, content: lastUserMessage }];
    for (const msg of history) {
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      } else {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      }
    }

    // 4. Call Gemini with conversation history and context in system instruction
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      systemInstruction,
    });
    const result = await model.generateContent({
      contents: contents,
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.6,
      },
    });
    const reply = result.response.text();

    return NextResponse.json({ reply, contextSources: sources });
  } catch (error) {
    console.error('[Chat API Error]', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}

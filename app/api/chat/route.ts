import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getContextForQuery } from '@/lib/contextLoader';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/** Models in order of preference; we fall back to the next when we hit rate limit / quota. */
const FALLBACK_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-1.0-pro',
];

function isRateLimitOrQuotaError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('529') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit')
  );
}

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

    // 2. System instruction: answer only from context; no fabrication
    const systemInstruction = `You are FINSA AI, a helpful assistant for the Finance Students' Association (FINSA).

RULES (follow strictly):
1. Answer ONLY using the exact information in the CONTEXT block below. Use the wording and details from the context—do not paraphrase into a generic answer.
2. Do not fabricate, infer, or add any information that is not explicitly in the context. No made-up dates, names, policies, or links.
3. If the context does not contain information that answers the user's question, reply in one short sentence: "This isn't covered in our knowledge base. For this, please check the FINSA website or email financeclub.sfu@gmail.com."
4. When the context does contain the answer, give a clear, direct answer based on that content. Do not say "the context does not contain enough information" if the context clearly addresses the question (e.g. "quant" or "quantitative" refers to the Quantitative Finance portfolio in the context).
5. You may include links from the context (e.g. finsasfu.com) when they appear in the context. Do not invent links.

--- CONTEXT ---
${context || '(No specific context matched. For any question, say: This is not in our knowledge base. Please check the FINSA website or email financeclub.sfu@gmail.com.)'}
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

    // 4. Try each model in order; on rate limit / quota, fall back to the next
    const generationConfig = { maxOutputTokens: 700, temperature: 0.65 };
    let lastError: unknown = null;

    for (const modelId of FALLBACK_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId, systemInstruction });
        const result = await model.generateContent({ contents, generationConfig });
        const response = result.response;
        if (!response.candidates?.length || !response.candidates[0].content?.parts?.length) {
          console.warn(`[Chat API] ${modelId} returned empty/blocked response, trying next.`);
          continue;
        }
        const replyText = response.text();
        return NextResponse.json({ reply: replyText, contextSources: sources });
      } catch (err) {
        lastError = err;
        if (isRateLimitOrQuotaError(err)) {
          console.warn(`[Chat API] ${modelId} rate limited, falling back to next model.`, err);
          continue;
        }
        throw err;
      }
    }

    console.error('[Chat API] All models failed or rate limited.', lastError);
    return NextResponse.json(
      { error: lastError instanceof Error ? lastError.message : 'All models unavailable or rate limited.' },
      { status: 503 }
    );
  } catch (error) {
    console.error('[Chat API Error]', error);
    const message = error instanceof Error ? error.message : 'Failed to generate response';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

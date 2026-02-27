import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getContextForQuery } from '@/lib/contextLoader';
import { endChatTrace, flushObservability, logModelAttempt, startChatTrace } from '@/lib/observability';

function getGeminiApiKeys(): string[] {
  const single = (process.env.GEMINI_API_KEY ?? '').trim();
  const multi = (process.env.GEMINI_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return Array.from(new Set([single, ...multi].filter(Boolean)));
}

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

function isUnavailableModelError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('model is not found') ||
    msg.includes('models/') ||
    msg.includes('not supported for generatecontent') ||
    msg.includes('unsupported') ||
    msg.includes('call listmodels')
  );
}

type ChatMessage = { role: 'user' | 'ai'; content: string };

export async function POST(req: NextRequest) {
  try {
    const apiKeys = getGeminiApiKeys();
    if (apiKeys.length === 0) {
      return NextResponse.json(
        { error: 'Missing Gemini API key. Set GEMINI_API_KEY or GEMINI_API_KEYS.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const message = typeof body.message === 'string' ? body.message : undefined;
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];

    const lastUserMessage = message ?? messages.filter((m) => m.role === 'user').pop()?.content;
    if (!lastUserMessage || typeof lastUserMessage !== 'string') {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }

    // 1. Get relevant context (multi-file) and source names for attribution
    const { content: context, sources } = getContextForQuery(lastUserMessage);
    const trace = startChatTrace({
      userMessage: lastUserMessage,
      contextSources: sources,
      apiKeyCount: apiKeys.length,
    });

    // 2. System instruction: answer only from context; no fabrication
    const systemInstruction = `You are FINSA AI, a helpful assistant for the Finance Students' Association (FINSA).

RULES (follow strictly):
1. Answer using the information in the CONTEXT block below. Be helpful and use the wording from the context. For general or opening questions (e.g. what is FINSA, what do you do, can you help), the context includes club info—use it to answer.
2. Do not fabricate or add information that is not in the context. No made-up dates, names, policies, or links.
3. Only say "This isn't covered in our knowledge base" when the user asks about something specific that is clearly not mentioned anywhere in the CONTEXT. If the context describes FINSA, the club, portfolios, recruitment, events, or contact info, use it—do not reply with "not in our knowledge base."
4. When the context contains the answer, give a clear, direct answer. You may include links from the context (e.g. finsasfu.com). Do not invent links.
5. Format responses for readability using Markdown:
   - Use short sections when useful.
   - Use **bold labels** for key items (e.g. **Timeline**, **How to apply**, **Contact**).
   - Use numbered lists for steps/processes and bullet points for options/lists.
   - Keep answers concise, but structured. For very short answers (1 sentence), plain text is fine.

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

    // 4. Try each key, then each model; on rate limit / quota / unavailable model / empty reply, fall back
    const generationConfig = { maxOutputTokens: 700, temperature: 0.65 };
    let lastError: unknown = null;
    let allEmpty = false;

    for (const apiKey of apiKeys) {
      const genAI = new GoogleGenerativeAI(apiKey);
      for (const modelId of FALLBACK_MODELS) {
        try {
          logModelAttempt(trace, { modelId, stage: 'start' });
          const model = genAI.getGenerativeModel({ model: modelId, systemInstruction });
          const result = await model.generateContent({ contents, generationConfig });
          const response = result.response;
          if (!response.candidates?.length || !response.candidates[0].content?.parts?.length) {
            console.warn(`[Chat API] ${modelId} returned empty/blocked response, trying next.`);
            logModelAttempt(trace, { modelId, stage: 'empty-or-blocked' });
            continue;
          }
          const replyText = response.text()?.trim() ?? '';
          if (!replyText) {
            console.warn(`[Chat API] ${modelId} returned empty text, trying next.`);
            allEmpty = true;
            logModelAttempt(trace, { modelId, stage: 'empty-text' });
            continue;
          }
          endChatTrace(trace, {
            output: { modelId, replyLength: replyText.length, status: 'success' },
          });
          await flushObservability();
          return NextResponse.json({ reply: replyText, contextSources: sources });
        } catch (err) {
          lastError = err;
          logModelAttempt(trace, {
            modelId,
            stage: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
          if (isRateLimitOrQuotaError(err) || isUnavailableModelError(err)) {
            console.warn(`[Chat API] ${modelId} unavailable/rate-limited, falling back to next model/key.`, err);
            continue;
          }
          endChatTrace(trace, {
            output: { modelId, status: 'fatal-error', error: err instanceof Error ? err.message : String(err) },
          });
          await flushObservability();
          throw err;
        }
      }
    }

    if (allEmpty) {
      console.error('[Chat API] All models returned empty text.');
      endChatTrace(trace, { output: { status: 'all-empty' } });
      await flushObservability();
      return NextResponse.json({
        reply: "I couldn't generate a response for that. Please try rephrasing your question or email financeclub.sfu@gmail.com for help.",
        contextSources: sources,
      });
    }
    console.error('[Chat API] All models failed or rate limited.', lastError);
    endChatTrace(trace, {
      output: {
        status: 'all-failed',
        error: lastError instanceof Error ? lastError.message : String(lastError),
      },
    });
    await flushObservability();
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

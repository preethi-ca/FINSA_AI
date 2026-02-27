import { Langfuse } from "langfuse";

type AnyRecord = Record<string, unknown>;

const isLangfuseEnabled =
  !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;

const langfuse = isLangfuseEnabled
  ? new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    })
  : null;

export function startChatTrace(input: {
  userMessage: string;
  contextSources: string[];
  apiKeyCount: number;
}) {
  if (!langfuse) return null;
  try {
    return langfuse.trace({
      name: "finsa-chat-request",
      input,
      tags: ["chat", "finsa-ai"],
    });
  } catch {
    return null;
  }
}

export function logModelAttempt(
  trace: { event: (payload: AnyRecord) => unknown } | null,
  payload: AnyRecord
) {
  if (!trace) return;
  try {
    trace.event({
      name: "model-attempt",
      ...payload,
    });
  } catch {
    // Observability should never break user responses.
  }
}

export function endChatTrace(
  trace: { update: (payload: AnyRecord) => unknown } | null,
  payload: AnyRecord
) {
  if (!trace) return;
  try {
    trace.update(payload);
  } catch {
    // Observability should never break user responses.
  }
}

export async function flushObservability(timeoutMs = 250) {
  if (!langfuse) return;
  try {
    await Promise.race([
      langfuse.flushAsync(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Ignore flush errors.
  }
}


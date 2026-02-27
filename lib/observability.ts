import { Langfuse } from "langfuse";

type AnyRecord = Record<string, unknown>;

const langfuseEnabled =
  !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;

const langfuse = langfuseEnabled
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
      input: {
        userMessage: input.userMessage,
        contextSources: input.contextSources,
        apiKeyCount: input.apiKeyCount,
      },
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
    // Observability should never break user requests.
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
    // Observability should never break user requests.
  }
}


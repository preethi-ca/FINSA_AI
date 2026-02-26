# Context-Aware Chat: How It Works

This document explains how the FINSA AI chatbot uses **context awareness** to answer from our knowledge base (markdown files) and maintain conversation history. Use it to onboard team members or explain the system to stakeholders.

---

## 1. What “context awareness” means here

- **Knowledge context:** The bot answers using content from the `contexts/` folder (e.g. recruitment, portfolios, events). It picks one or more files based on what the user asked and injects that text into the prompt.
- **Conversation context:** The bot sees the full chat history (all previous user and assistant messages) so it can handle follow-ups like “When is that?” or “Tell me more about that portfolio.”

Together, this is what we call “context awareness.”

---

## 2. High-level flow (user sends a message)

```
User types message in UI
    → Frontend sends: { message, messages: [full chat history] } to /api/chat
    → API picks relevant context files from the user’s last message (keyword scoring)
    → API builds a “system” prompt that includes: who the bot is + the chosen context text
    → API sends to Gemini: system instruction + full conversation + latest message
    → Gemini replies using that context and history
    → API returns { reply, contextSources } to frontend
    → Frontend shows the reply and, under it, “Based on: recruitment, events” (or similar)
```

So in one sentence: **the user’s message is used to select which markdown files to load; those files + the full chat are sent to the model, which answers from that context and we show which files were used.**

---

## 3. Where each part lives in the codebase

| What | Where |
|------|--------|
| Context files (content the bot reads) | `contexts/*.md` (e.g. `recruitment.md`, `portfolios.md`, `events.md`, `exec.md`, `general.md`, `bulls_cage.md`) |
| Logic that picks which file(s) to use | `lib/contextLoader.ts` |
| API that calls Gemini and injects context | `app/api/chat/route.ts` |
| Chat UI and “Based on: …” sources | `app/page.tsx` |

---

## 4. How we choose which context file(s) to use (contextLoader)

- We don’t use embeddings or search. We use **keyword matching**.
- In `lib/contextLoader.ts` there is a map: **filename → list of keywords** (e.g. `recruitment.md` → `['hiring', 'apply', 'recruitment', 'resume', 'interview', ...]`).
- When the user sends a message:
  1. We take the **last user message** and turn it into a lowercase string.
  2. For **each** context file we **score** it: how many of its keywords appear in that string (each match = +1).
  3. We keep:
     - The **top-scoring** file(s), and
     - Any other file with score ≥ 1, up to a **maximum of 3 files** (so a question like “events and recruitment” can pull in both `events.md` and `recruitment.md`).
  4. We **read those files** from disk, concatenate their content (with labels like `--- recruitment.md ---`), and return:
     - **content:** the combined text to put in the prompt,
     - **sources:** the list of filenames (e.g. `['recruitment.md', 'events.md']`) for the “Based on: …” line.

So: **one message → score all files by keywords → take up to 3 files → return one blob of text + source names.** No ML here, just keyword counts.

---

## 5. How the API uses that context and history (route.ts)

- The API receives:
  - **message:** the latest user message (used for context selection),
  - **messages:** the full list of `{ role: 'user' | 'ai', content }` so far (including the new user message).
- It calls **`getContextForQuery(lastUserMessage)`** to get:
  - The combined context text from the chosen file(s),
  - The list of source filenames.
- It builds a **system instruction** for Gemini that:
  - Says the bot is “FINSA AI” and must use **only** the provided context to answer,
  - Pastes in the context (or a short fallback if no file matched),
  - Tells the model not to invent dates/names and to suggest the website or financeclub.sfu@gmail.com when unsure.
- It then sends to Gemini:
  - **contents:** the full conversation (each turn as `user` or `model` with `parts: [{ text: '...' }]`),
  - **systemInstruction:** the string above (so the “knowledge” is in the system, not repeated in every turn).
- The API responds with **reply** (Gemini’s text) and **contextSources** (the list of filenames we used). The frontend uses `contextSources` to show “Based on: …”.

So: **context selection from the last user message, full chat history in `contents`, knowledge in `systemInstruction`, and source attribution in the response.**

---

## 6. How the frontend uses it (page.tsx)

- On send, the frontend sends **message** (current input) and **messages** (all messages in the chat, including the one just added).
- When the API returns **reply** and **contextSources**, the frontend:
  - Appends the assistant message with **content = reply** and **sources = contextSources**.
  - Renders under each AI message: “Based on: recruitment, events” (or whatever) when `sources` is present.

So users and your team can see **which context file(s)** were used for each answer.

---

## 7. What we changed / added (summary for the team)

- **Multi-file context:** We no longer use only the single best file. We use up to 3 files when the query touches multiple topics (e.g. events + recruitment), so answers can use several markdown files at once.
- **Source attribution:** The API returns which files were used; the UI shows “Based on: …” under each AI message so behaviour is transparent.
- **Conversation history:** The API now receives the full chat and sends it to Gemini, so the model can refer to earlier questions and answers (e.g. “When is that?” after a question about an event).
- **Clearer system prompt:** The model is instructed to stick to the provided context and not invent information, and to suggest the website or financeclub.sfu@gmail.com when the context doesn’t cover the question.

---

## 8. How to add or change context

- **New topic:** Add a new `.md` file in `contexts/` (e.g. `careers.md`). Then in `lib/contextLoader.ts` add an entry to **CONTEXT_KEYWORDS** mapping that filename to a list of keywords that should trigger it. No other code change needed.
- **Update content:** Edit the existing `contexts/*.md` files. The next request will read the updated files from disk.
- **Tune which file is used:** Adjust the keyword list for that file in **CONTEXT_KEYWORDS** (add/remove words). More specific keywords reduce accidental matches; broader keywords make that file appear more often.
- **Change how many files we use:** In `lib/contextLoader.ts`, change **MAX_CONTEXT_FILES** (default 3) and/or **MIN_SCORE_TO_INCLUDE** (default 1).

---

## 9. Quick reference: request and response

**Request (POST /api/chat):**

```json
{
  "message": "When does recruitment open?",
  "messages": [
    { "role": "ai", "content": "Welcome to FINSA AI..." },
    { "role": "user", "content": "When does recruitment open?" }
  ]
}
```

**Response:**

```json
{
  "reply": "FINSA's main recruitment cycle runs every September...",
  "contextSources": ["recruitment.md"]
}
```

The model uses **message** (and the rest of **messages**) plus the context loaded from **contextSources** to produce **reply**.

---

If you need to explain this in a meeting, you can say: *“The bot picks 1–3 markdown files from our `contexts/` folder based on keywords in the user’s message, sends that text plus the full chat to Gemini, and we show which files were used under each answer. We can add or edit those files anytime to change what the bot knows.”*

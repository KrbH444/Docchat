// Retrieval-augmented answering with Claude, streamed as NDJSON events.

import Anthropic from "@anthropic-ai/sdk";
import type { ScoredChunk } from "./bm25.ts";
import { store } from "./store.ts";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface Source {
  n: number; // 1-based number shown in the UI
  docName: string;
  page: number;
  text: string;
}

export type StreamEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "text"; text: string }
  | { type: "cite"; ns: number[] }
  | { type: "notice"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

const MODEL = process.env.DOCCHAT_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.DOCCHAT_EFFORT || "low") as "low" | "medium" | "high";
const TOP_K = 6;

const SYSTEM_PROMPT = `You answer questions using only the documents provided in the user's message.
- Ground every factual statement in the documents and cite them.
- If the documents do not contain the answer, say so plainly and suggest what document might help. Do not use outside knowledge to fill gaps.
- Reply in the language the user wrote in (Arabic or English). If the user writes Arabic, reply in Modern Standard Arabic.
- Be concise: lead with the direct answer, then supporting detail.`;

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function retrieve(question: string, history: Turn[]): ScoredChunk[] {
  // Blend in the previous user question so follow-ups ("and in Jeddah?") still retrieve well.
  const lastUser = [...history].reverse().find((t) => t.role === "user")?.content ?? "";
  let hits = dropWeak(store.index.search(question, TOP_K));
  if (hits.length === 0 && lastUser) {
    const extra = dropWeak(store.index.search(`${question} ${lastUser}`, TOP_K));
    const seen = new Set(hits.map((h) => h.chunk.id));
    hits = [...hits, ...extra.filter((h) => !seen.has(h.chunk.id))].slice(0, TOP_K);
  }
  return hits;
}

/** Keep only passages scoring at least 25% of the best match, so noise doesn't reach the model. */
function dropWeak(hits: ScoredChunk[]): ScoredChunk[] {
  const best = hits[0]?.score ?? 0;
  return hits.filter((h) => h.score >= best * 0.25);
}

function toSources(hits: ScoredChunk[]): Source[] {
  return hits.map((h, i) => ({ n: i + 1, docName: h.chunk.docName, page: h.chunk.page, text: h.chunk.text }));
}

export async function* answer(question: string, history: Turn[]): AsyncGenerator<StreamEvent> {
  const hits = retrieve(question, history);
  const sources = toSources(hits);
  yield { type: "sources", sources };

  if (!hasCredentials()) {
    if (sources.length > 0) {
      yield { type: "text", text: sources[0].text.replace(/^#+\s*/gm, "") };
      yield { type: "cite", ns: [1] };
    }
    yield {
      type: "notice",
      text:
        sources.length > 0
          ? "Retrieval-only demo mode (no ANTHROPIC_API_KEY set): showing the best-matching passage. Add a key in .env.local to get a written, cited answer."
          : "Retrieval-only demo mode (no ANTHROPIC_API_KEY set), and no passage matched your question.",
    };
    yield { type: "done" };
    return;
  }

  if (sources.length === 0) {
    yield {
      type: "text",
      text: store.docs.size === 0
        ? "Upload a document first, then ask a question about it."
        : "I couldn't find anything about that in the uploaded documents. Try different wording or upload a document that covers it.",
    };
    yield { type: "done" };
    return;
  }

  const documents: Anthropic.Beta.BetaContentBlockParam[] = hits.map((h) => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: h.chunk.text },
    title: `${h.chunk.docName} (page ${h.chunk.page})`,
    citations: { enabled: true },
  }));

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: [...documents, { type: "text", text: question }] },
  ];

  const client = new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: { effort: EFFORT },
      // Server-side refusal fallback: if a safety classifier declines, the API
      // re-runs the request on a suitable fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });

    let pending = new Set<number>();
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "citations_delta") {
          const c = event.delta.citation;
          if ("document_index" in c && typeof c.document_index === "number") pending.add(c.document_index + 1);
        }
      } else if (event.type === "content_block_stop" && pending.size > 0) {
        yield { type: "cite", ns: [...pending].sort((a, b) => a - b) };
        pending = new Set();
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      yield { type: "notice", text: "The model declined to answer this request." };
    } else if (final.stop_reason === "max_tokens") {
      yield { type: "notice", text: "The answer was cut off because it hit the length limit." };
    }
  } catch (error) {
    let message = "Something went wrong while generating the answer.";
    if (error instanceof Anthropic.AuthenticationError) message = "The API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
    else if (error instanceof Anthropic.RateLimitError) message = "Rate limited by the API. Wait a moment and try again.";
    else if (error instanceof Anthropic.BadRequestError) message = `Bad request: ${error.message}`;
    else if (error instanceof Anthropic.APIError) message = `API error ${error.status ?? ""}: ${error.message}`;
    yield { type: "error", message };
  }
  yield { type: "done" };
}

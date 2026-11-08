import { answer, hasCredentials, type Turn } from "@/lib/answer.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 10;

export async function GET() {
  return Response.json({ aiEnabled: hasCredentials() });
}

export async function POST(request: Request) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";
  if (!question) return Response.json({ error: "Question is required." }, { status: 400 });

  const history: Turn[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is Turn =>
            !!t && typeof t === "object" && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.length > 0,
        )
        .slice(-MAX_HISTORY)
    : [];
  // The API requires the first message to be from the user.
  while (history.length && history[0].role !== "user") history.shift();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const event of answer(question, history)) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

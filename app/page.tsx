"use client";

import { useEffect, useRef, useState } from "react";
import type { DocInfo } from "@/lib/store.ts";
import type { Source, StreamEvent } from "@/lib/answer.ts";

interface Segment {
  text: string;
  cites: number[];
}

interface Message {
  role: "user" | "assistant";
  segments: Segment[];
  sources: Source[];
  notice?: string;
  error?: string;
  pending?: boolean;
}

const EXAMPLES = [
  "How many remote days can I take per week?",
  "What is the meal allowance on business trips?",
  "كم مدة إجازة الحج ومن يستحقها؟",
  "هل يمكن ترحيل رصيد الإجازة السنوية؟",
];

function plainText(m: Message): string {
  return m.segments.map((s) => s.text).join("");
}

export default function Home() {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [openSource, setOpenSource] = useState<Source | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/documents").then((r) => r.json()).then((d) => setDocs(d.documents));
    fetch("/api/chat").then((r) => r.json()).then((d) => setAiEnabled(d.aiEnabled));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadErrors([]);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();
      if (data.documents) setDocs(data.documents);
      setUploadErrors(data.errors ?? (data.error ? [data.error] : []));
    } catch {
      setUploadErrors(["Upload failed. Check your connection and try again."]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function loadSamples() {
    const res = await fetch("/api/sample", { method: "POST" });
    setDocs((await res.json()).documents);
  }

  async function removeDoc(id: string) {
    const res = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setDocs((await res.json()).documents);
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput("");
    const history = messages
      .filter((m) => !m.error && plainText(m))
      .map((m) => ({ role: m.role, content: plainText(m) }));
    setMessages((prev) => [
      ...prev,
      { role: "user", segments: [{ text: q, cites: [] }], sources: [] },
      { role: "assistant", segments: [], sources: [], pending: true },
    ]);

    const update = (fn: (m: Message) => Message) =>
      setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

    const apply = (event: StreamEvent) => {
      switch (event.type) {
        case "sources":
          update((m) => ({ ...m, sources: event.sources }));
          break;
        case "text":
          update((m) => {
            const segs = [...m.segments];
            const last = segs[segs.length - 1];
            if (last && last.cites.length === 0) segs[segs.length - 1] = { ...last, text: last.text + event.text };
            else segs.push({ text: event.text, cites: [] });
            return { ...m, segments: segs };
          });
          break;
        case "cite":
          update((m) => {
            const segs = [...m.segments];
            const last = segs[segs.length - 1];
            if (last) segs[segs.length - 1] = { ...last, cites: event.ns };
            return { ...m, segments: segs };
          });
          break;
        case "notice":
          update((m) => ({ ...m, notice: event.text }));
          break;
        case "error":
          update((m) => ({ ...m, error: event.message }));
          break;
        case "done":
          update((m) => ({ ...m, pending: false }));
          break;
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Request failed.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as StreamEvent);
      }
    } catch (e) {
      apply({ type: "error", message: e instanceof Error ? e.message : "Request failed." });
    } finally {
      update((m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>◆</span>
          <div>
            <h1>DocChat</h1>
            <p className="muted">Ask your documents. Arabic or English. Every answer cited.</p>
          </div>
        </div>

        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
        >
          <strong>{uploading ? "Reading files…" : "Drop files or click to upload"}</strong>
          <span className="muted">PDF, TXT, MD, CSV, JSON, HTML · up to 15 MB</span>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,.htm"
            hidden
            onChange={(e) => upload(e.target.files)}
          />
        </div>
        {uploadErrors.map((e) => (
          <p key={e} className="error small">{e}</p>
        ))}

        <div className="doclist">
          <div className="doclist-head">
            <h2>Documents</h2>
            <button className="link" onClick={loadSamples}>Load samples</button>
          </div>
          {docs.length === 0 && <p className="muted small">No documents yet.</p>}
          <ul>
            {docs.map((d) => (
              <li key={d.id}>
                <div>
                  <span className="docname" dir="auto">{d.name}</span>
                  <span className="muted small">
                    {d.pages} {d.pages === 1 ? "page" : "pages"} · {d.chunks} chunks
                  </span>
                </div>
                <button className="icon" aria-label={`Remove ${d.name}`} onClick={() => removeDoc(d.id)}>×</button>
              </li>
            ))}
          </ul>
        </div>

        {aiEnabled === false && (
          <p className="banner small">
            Demo mode: no <code>ANTHROPIC_API_KEY</code>. DocChat shows matching passages only.
          </p>
        )}
      </aside>

      <main className="chat">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty">
              <h2>Ask anything about your documents</h2>
              <p className="muted">Load the samples to try it, then pick a question:</p>
              <div className="examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex} dir="auto" onClick={() => ask(ex)} disabled={busy || docs.length === 0}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="bubble" dir="auto">
                {m.segments.map((s, j) => (
                  <span key={j}>
                    {s.text}
                    {s.cites.map((n) => {
                      const src = m.sources.find((x) => x.n === n);
                      return (
                        <button key={n} className="cite" onClick={() => src && setOpenSource(src)} title={src ? `${src.docName}, page ${src.page}` : ""}>
                          {n}
                        </button>
                      );
                    })}
                  </span>
                ))}
                {m.pending && m.segments.length === 0 && <span className="typing">Searching documents…</span>}
                {m.notice && <p className="notice" dir="ltr">{m.notice}</p>}
                {m.error && <p className="error" dir="ltr">{m.error}</p>}
              </div>
              {m.role === "assistant" && m.sources.length > 0 && (
                <details className="sources" open={aiEnabled === false}>
                  <summary>{m.sources.length} sources searched</summary>
                  <ol>
                    {m.sources.map((s) => (
                      <li key={s.n}>
                        <button className="link" onClick={() => setOpenSource(s)}>
                          [{s.n}] <span dir="auto">{s.docName}</span>, p. {s.page}
                        </button>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={docs.length ? "Ask a question… / اكتب سؤالك…" : "Upload a document to start"}
            disabled={busy}
            aria-label="Question"
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? "…" : "Ask"}
          </button>
        </form>
      </main>

      {openSource && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setOpenSource(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong dir="auto">
                [{openSource.n}] {openSource.docName}, page {openSource.page}
              </strong>
              <button className="icon" aria-label="Close" onClick={() => setOpenSource(null)}>×</button>
            </div>
            <p className="passage" dir="auto">{openSource.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}

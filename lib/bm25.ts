// Minimal BM25 index (Okapi BM25, k1=1.5, b=0.75) over chunks.

import type { Chunk } from "./chunk.ts";
import { tokenize } from "./text.ts";

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

const K1 = 1.5;
const B = 0.75;

export class Bm25Index {
  private docs: { chunk: Chunk; tf: Map<string, number>; length: number }[] = [];
  private df = new Map<string, number>();
  private totalLength = 0;

  add(chunks: Chunk[]): void {
    for (const chunk of chunks) {
      const terms = tokenize(chunk.text);
      const tf = new Map<string, number>();
      for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ chunk, tf, length: terms.length });
      this.totalLength += terms.length;
    }
  }

  removeDoc(docId: string): void {
    const kept = this.docs.filter((d) => d.chunk.docId !== docId);
    this.docs = [];
    this.df.clear();
    this.totalLength = 0;
    this.add(kept.map((d) => d.chunk));
  }

  get size(): number {
    return this.docs.length;
  }

  search(query: string, topK = 6): ScoredChunk[] {
    const qTerms = [...new Set(tokenize(query))];
    if (qTerms.length === 0 || this.docs.length === 0) return [];
    const n = this.docs.length;
    const avgLen = this.totalLength / n || 1;
    const scored: ScoredChunk[] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const term of qTerms) {
        const f = d.tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avgLen)));
      }
      if (score > 0) scored.push({ chunk: d.chunk, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

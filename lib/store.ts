// In-memory document store. Fine for a demo; swap for a database in production.

import { Bm25Index } from "./bm25.ts";
import { chunkPages, type Page } from "./chunk.ts";

export interface DocInfo {
  id: string;
  name: string;
  pages: number;
  chunks: number;
  addedAt: number;
}

interface Store {
  docs: Map<string, DocInfo>;
  index: Bm25Index;
}

// Survive hot reloads in dev by parking the store on globalThis.
const g = globalThis as unknown as { __docchatStore?: Store };
export const store: Store = (g.__docchatStore ??= { docs: new Map(), index: new Bm25Index() });

export function addDocument(name: string, pages: Page[]): DocInfo {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const chunks = chunkPages(id, name, pages);
  store.index.add(chunks);
  const info: DocInfo = { id, name, pages: pages.length, chunks: chunks.length, addedAt: Date.now() };
  store.docs.set(id, info);
  return info;
}

export function removeDocument(id: string): boolean {
  if (!store.docs.delete(id)) return false;
  store.index.removeDoc(id);
  return true;
}

export function listDocuments(): DocInfo[] {
  return [...store.docs.values()].sort((a, b) => a.addedAt - b.addedAt);
}

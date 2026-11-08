// Split documents into overlapping chunks that keep their page number.

export interface Page {
  page: number; // 1-based; 1 for non-paginated text
  text: string;
}

export interface Chunk {
  id: string;
  docId: string;
  docName: string;
  page: number;
  text: string;
}

const TARGET = 900; // characters per chunk
const OVERLAP = 150;

/** Break on paragraph / sentence boundaries close to the target size. */
export function chunkPages(docId: string, docName: string, pages: Page[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) continue;
    let start = 0;
    while (start < clean.length) {
      let end = Math.min(start + TARGET, clean.length);
      if (end < clean.length) {
        const window = clean.slice(start, end);
        const breakAt = Math.max(
          window.lastIndexOf("\n\n"),
          window.lastIndexOf(". "),
          window.lastIndexOf("\n"),
          window.lastIndexOf("؟ "),
          window.lastIndexOf("? "),
        );
        if (breakAt > TARGET * 0.5) end = start + breakAt + 1;
      }
      const piece = clean.slice(start, end).trim();
      if (piece) {
        chunks.push({ id: `${docId}:${chunks.length}`, docId, docName, page, text: piece });
      }
      if (end >= clean.length) break;
      start = Math.max(end - OVERLAP, start + 1);
    }
  }
  return chunks;
}

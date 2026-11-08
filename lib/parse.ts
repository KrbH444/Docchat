// Turn uploaded files into page-level text.

import type { Page } from "./chunk.ts";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function fileToPages(name: string, bytes: Uint8Array): Promise<Page[]> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((t, i) => ({ page: i + 1, text: t }));
    if (pages.every((p) => !p.text.trim())) {
      throw new Error("This PDF has no extractable text (it may be a scanned image). Try a text-based PDF.");
    }
    return pages;
  }
  if (/\.(txt|md|markdown|csv|json|html?)$/.test(lower)) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return [{ page: 1, text: lower.match(/\.html?$/) ? stripHtml(text) : text }];
  }
  throw new Error("Unsupported file type. Upload PDF, TXT, MD, CSV, JSON or HTML.");
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

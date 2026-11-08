import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { addDocument, listDocuments } from "@/lib/store.ts";

export const runtime = "nodejs";

const SAMPLES = ["handbook-en.md", "leave-policy-ar.md"];

export async function POST() {
  const loaded = new Set(listDocuments().map((d) => d.name));
  for (const name of SAMPLES) {
    if (loaded.has(name)) continue;
    const text = await readFile(path.join(process.cwd(), "samples", name), "utf-8");
    // Split markdown sample on "## " headings so citations point at a "page" (section).
    const sections = text.split(/\n(?=## )/).map((t, i) => ({ page: i + 1, text: t }));
    addDocument(name, sections);
  }
  return NextResponse.json({ documents: listDocuments() });
}

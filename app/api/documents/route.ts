import { NextResponse } from "next/server";
import { addDocument, listDocuments, removeDocument } from "@/lib/store.ts";
import { fileToPages, MAX_UPLOAD_BYTES } from "@/lib/parse.ts";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ documents: listDocuments() });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files uploaded." }, { status: 400 });

  const added = [];
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: larger than 15 MB.`);
      continue;
    }
    try {
      const pages = await fileToPages(file.name, new Uint8Array(await file.arrayBuffer()));
      added.push(addDocument(file.name, pages));
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "could not be read."}`);
    }
  }
  return NextResponse.json({ added, errors, documents: listDocuments() }, { status: added.length ? 200 : 400 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !removeDocument(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json({ documents: listDocuments() });
}

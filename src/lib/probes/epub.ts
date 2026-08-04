import EPub from "epub";

export interface EpubSpineEntry {
  id: string;
  label: string;
  href: string;
}

export interface EpubProbeResult {
  title: string;
  author: string;
  spine: EpubSpineEntry[];
  wordCount: number;
}

// Read only the EPUB's structure (container → OPF → spine + metadata + TOC).
// Does NOT extract chapter bodies — the reader renders natively from R2 at
// read time, so we only need the ordered chapter list + title/author.
//
// The buffer is the full EPUB fetched from R2 once at import time. EPUBs are
// typically a few MB; even a 1GB "book" is almost always a PDF, so this is
// fine in practice.
export async function probeEpub(buffer: Buffer): Promise<EpubProbeResult> {
  // The `epub` package runtime accepts a Buffer, but its @types only declare a
  // string path. Cast to the documented runtime form.
  const epub = new (EPub as unknown as new (b: Buffer) => InstanceType<typeof EPub>)(buffer);
  await epub.parse();

  const meta = epub.metadata as { title?: string; creator?: string };
  const title = meta.title || "Untitled";
  const author = meta.creator || "";

  // flow gives the reading order; toc gives labels.
  const flow = (epub.flow || []) as { id: string; href: string }[];
  const toc = (epub.toc || []) as { title: string; href: string }[];

  const spine: EpubSpineEntry[] = flow.map((item, i) => {
    const tocEntry = toc.find((t) => t.href?.includes(item.id));
    return {
      id: item.id,
      href: item.href || "",
      label: tocEntry?.title || `Section ${i + 1}`,
    };
  });

  if (spine.length === 0) {
    throw new Error("This EPUB has no readable spine.");
  }

  return { title, author, spine, wordCount: 0 };
}

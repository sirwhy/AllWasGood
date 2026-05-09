import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "storage");

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = normalize(join(ROOT, ...path));
  if (!target.startsWith(ROOT)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const s = await stat(target);
    if (!s.isFile()) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const buf = await readFile(target);
    const lower = target.toLowerCase();
    let ct = "application/octet-stream";
    if (lower.endsWith(".png")) ct = "image/png";
    else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) ct = "image/jpeg";
    else if (lower.endsWith(".webp")) ct = "image/webp";
    else if (lower.endsWith(".mp4")) ct = "video/mp4";
    else if (lower.endsWith(".webm")) ct = "video/webm";
    else if (lower.endsWith(".mp3")) ct = "audio/mpeg";
    else if (lower.endsWith(".wav")) ct = "audio/wav";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

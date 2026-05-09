/**
 * AI Editor renderer: takes a timeline-style EditorComposition (sequence
 * of clips with optional text overlays + a global background-music track)
 * and renders it to MP4 with FFmpeg.
 *
 * Runs inside the BullMQ worker; relies on `ffmpeg` being available on
 * PATH (already installed in the worker Docker image).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type EditorAspect = "16:9" | "9:16" | "1:1" | "4:5";

export interface EditorTextOverlay {
  text: string;
  position: "top" | "center" | "bottom";
  fontSize?: number;
  color?: string;
  /** Show overlay from this many seconds into the clip (default 0). */
  fromSeconds?: number;
  /** Hide overlay this many seconds into the clip (default = clip end). */
  toSeconds?: number;
}

export interface EditorClip {
  id: string;
  /** Either an http(s) URL or a local path. */
  src: string;
  /** When 'auto', images use durationSeconds and videos use natural length. */
  kind: "image" | "video";
  /** Required for image clips, optional for video clips (trim length). */
  durationSeconds?: number;
  /** Per-clip text overlays. */
  overlays?: EditorTextOverlay[];
}

export interface EditorAudio {
  src: string;
  /** 0 - 1, default 0.4 to sit under any clip audio. */
  volume?: number;
}

export interface EditorComposition {
  aspect: EditorAspect;
  /** Frames per second; 30 is a sensible default. */
  fps?: number;
  clips: EditorClip[];
  audio?: EditorAudio;
}

const ASPECT_TO_DIM: Record<EditorAspect, [number, number]> = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

export function aspectToEditorDim(a: EditorAspect): [number, number] {
  return ASPECT_TO_DIM[a];
}

async function downloadIfRemote(src: string, dest: string): Promise<string> {
  if (!/^https?:\/\//i.test(src)) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Download ${src} failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return dest;
}

function escapeDrawtext(text: string): string {
  // ffmpeg drawtext escaping: backslash, colon, percent, single-quote, comma.
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/'/g, "\\\\'")
    .replace(/,/g, "\\,");
}

function overlayDrawtextFilter(o: EditorTextOverlay): string {
  const fontSize = o.fontSize ?? 64;
  const color = o.color ?? "white";
  const txt = escapeDrawtext(o.text);
  const yExpr =
    o.position === "top" ? "h*0.08" : o.position === "bottom" ? "h*0.82" : "(h-text_h)/2";
  let f = `drawtext=text='${txt}':fontcolor=${color}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yExpr}:box=1:boxcolor=black@0.5:boxborderw=20`;
  if (typeof o.fromSeconds === "number" || typeof o.toSeconds === "number") {
    const from = o.fromSeconds ?? 0;
    const enable = typeof o.toSeconds === "number" ? `between(t,${from},${o.toSeconds})` : `gte(t,${from})`;
    f += `:enable='${enable}'`;
  }
  return f;
}

function clipFilter(
  clip: EditorClip,
  width: number,
  height: number,
  fps: number,
  inputIndex: number,
  outputLabel: string,
): string {
  // scale + center-crop to target box, force fps + sar, then overlays
  const base =
    `[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
    `crop=${width}:${height},setsar=1,fps=${fps}`;
  const overlays = (clip.overlays ?? []).map(overlayDrawtextFilter).join(",");
  const tail = overlays ? `,${overlays}` : "";
  return `${base}${tail}[${outputLabel}]`;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export interface EditorRenderResult {
  filePath: string;
  bytes: Buffer;
}

export async function renderEditorComposition(
  comp: EditorComposition,
): Promise<EditorRenderResult> {
  if (!comp.clips.length) throw new Error("Composition has no clips");
  const [w, h] = aspectToEditorDim(comp.aspect);
  const fps = comp.fps ?? 30;
  const tmpRoot = await mkdtemp(join(tmpdir(), "awg-editor-render-"));
  try {
    // 1. Download remote clip sources.
    const localClips = await Promise.all(
      comp.clips.map(async (c, i) => {
        const ext =
          c.kind === "video"
            ? c.src.match(/\.(mp4|webm|mov|mkv)(?:\?|#|$)/i)?.[1]?.toLowerCase() || "mp4"
            : c.src.match(/\.(png|jpe?g|webp|gif|avif|bmp)(?:\?|#|$)/i)?.[1]?.toLowerCase() || "jpg";
        const dest = join(tmpRoot, `clip-${i}.${ext}`);
        const path = await downloadIfRemote(c.src, dest);
        return { ...c, src: path };
      }),
    );

    // Per-clip render to a normalized intermediate (so concat works cleanly).
    const intermediates: string[] = [];
    for (let i = 0; i < localClips.length; i++) {
      const c = localClips[i];
      const out = join(tmpRoot, `seg-${i}.mp4`);
      const inputArgs: string[] =
        c.kind === "image"
          ? [
              "-y",
              "-loop",
              "1",
              "-framerate",
              String(fps),
              "-t",
              String(c.durationSeconds ?? 4),
              "-i",
              c.src,
            ]
          : [
              "-y",
              "-i",
              c.src,
              ...(c.durationSeconds ? ["-t", String(c.durationSeconds)] : []),
            ];
      const filter = clipFilter(c, w, h, fps, 0, "vout");
      const args = [
        ...inputArgs,
        "-filter_complex",
        filter,
        "-map",
        "[vout]",
        ...(c.kind === "video" ? ["-map", "0:a?"] : []),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(fps),
        "-c:a",
        "aac",
        "-shortest",
        out,
      ];
      await runFfmpeg(args);
      intermediates.push(out);
    }

    // 2. Concat all segments via the demuxer (lossless container concat).
    const listFile = join(tmpRoot, "concat.txt");
    await writeFile(listFile, intermediates.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    const concatOut = join(tmpRoot, "concat.mp4");
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      concatOut,
    ]);

    // 3. Optional bg music: mix down with the existing audio track.
    let finalOut = concatOut;
    if (comp.audio?.src) {
      const audioLocal = await downloadIfRemote(
        comp.audio.src,
        join(tmpRoot, `bgm.${comp.audio.src.match(/\.([a-z0-9]{2,4})(?:\?|#|$)/i)?.[1] || "mp3"}`),
      );
      const mixOut = join(tmpRoot, "final.mp4");
      const vol = Math.max(0, Math.min(1, comp.audio.volume ?? 0.4));
      // Side-chain: cap bgm length to video, mix with original audio.
      await runFfmpeg([
        "-y",
        "-i",
        concatOut,
        "-stream_loop",
        "-1",
        "-i",
        audioLocal,
        "-filter_complex",
        `[1:a]volume=${vol}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        mixOut,
      ]);
      finalOut = mixOut;
    }

    const bytes = await readFile(finalOut);
    return { filePath: finalOut, bytes };
  } finally {
    // Caller is expected to have read bytes by now; safe to rm tree.
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

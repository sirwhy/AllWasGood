/**
 * Thin ffmpeg helper — runs ffmpeg via child_process.spawn so we don't pull
 * in a wrapper dependency (fluent-ffmpeg etc). The worker container ships
 * with ffmpeg installed (see Dockerfile).
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";

export async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 1000)}`));
    });
  });
}

export interface SceneInput {
  imagePath: string;
  audioPath: string;
}

export interface RenderOptions {
  scenes: SceneInput[];
  width: number;
  height: number;
  fps?: number;
  outputPath: string;
}

/**
 * Render N image+audio scenes to a single MP4. Each scene's video duration
 * is whatever the provided audio file is (we use -shortest with a looped
 * still image). Scenes are concatenated with codec-copy.
 */
export async function renderScenesToMp4(opts: RenderOptions): Promise<void> {
  const fps = opts.fps ?? 30;
  if (!opts.scenes.length) throw new Error("renderScenesToMp4: no scenes");

  // Write each scene as an h264+aac mp4 so we can later -c copy concat.
  const tmpRoot = await mkdtemp(join(tmpdir(), "awg-l2v-"));
  const sceneFiles: string[] = [];
  try {
    for (let i = 0; i < opts.scenes.length; i++) {
      const s = opts.scenes[i];
      const out = join(tmpRoot, `scene-${String(i).padStart(3, "0")}.mp4`);
      const vf = [
        `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase`,
        `crop=${opts.width}:${opts.height}`,
        `format=yuv420p`,
      ].join(",");
      await runFfmpeg([
        "-loop", "1",
        "-framerate", String(fps),
        "-i", s.imagePath,
        "-i", s.audioPath,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-pix_fmt", "yuv420p",
        "-r", String(fps),
        "-vf", vf,
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-ac", "2",
        "-shortest",
        "-movflags", "+faststart",
        out,
      ]);
      sceneFiles.push(out);
    }

    // concat list
    const listPath = join(tmpRoot, "concat.txt");
    await writeFile(
      listPath,
      sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
    );
    await mkdir(join(opts.outputPath, ".."), { recursive: true });
    await runFfmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      opts.outputPath,
    ]);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

export function aspectToDimensions(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
    default:
      return { width: 1920, height: 1080 };
  }
}

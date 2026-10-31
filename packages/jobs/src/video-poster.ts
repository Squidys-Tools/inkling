import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

const posterEdge = 512;
const execute = promisify(execFile);

/** The system thumbnailer, as a PNG no larger than `edge`, or null when it has none. */
export type ShellThumbnail = (path: string, edge: number) => Promise<Uint8Array | null>;

export async function createVideoPoster(
  filePath: string,
  { shell, decoderPath }: { shell?: ShellThumbnail; decoderPath?: string | null } = {},
) {
  if (shell) {
    try {
      const png = await shell(filePath, posterEdge);
      if (png?.length) return Buffer.from(png);
    } catch {
      // A local decoder can still support a format the shell does not.
    }
  }
  const decoder =
    decoderPath === undefined
      ? process.platform === "linux"
        ? "/usr/bin/ffmpeg"
        : null
      : decoderPath;
  if (!decoder) return null;
  if (!isAbsolute(decoder) || !isAbsolute(filePath) || filePath.includes("\0"))
    throw new Error("Video poster requires absolute local paths.");
  const source = await stat(filePath);
  if (!source.isFile() || source.size > 1024 * 1024 * 1024) return null;
  try {
    const { stdout } = await execute(
      decoder,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-max_alloc",
        "67108864",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov,matroska,webm,avi,mpeg,mpegvideo,asf,ogg",
        "-i",
        filePath,
        "-map",
        "0:v:0",
        "-an",
        "-sn",
        "-dn",
        "-frames:v",
        "1",
        "-vf",
        `scale=${posterEdge}:${posterEdge}:force_original_aspect_ratio=decrease`,
        "-threads",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "pipe:1",
      ],
      { encoding: "buffer", timeout: 15_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    );
    if (!stdout.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error("Video decoder returned no image.");
    return stdout;
  } catch {
    return null;
  }
}

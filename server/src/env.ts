import { join } from 'node:path';
import { tmpdir } from 'node:os';

export type ServerEnv = {
  port: number;
  mediaRoot: string;
  ytdlpPath: string;
  downloadToken?: string;
  webDistDir: string;
};

export function loadEnv(): ServerEnv {
  const port = Number.parseInt(process.env.PORT ?? '4010', 10);
  const mediaRoot = process.env.MEDIA_ROOT?.trim() || join(process.cwd(), 'data', 'media');
  const ytdlpPath = process.env.YT_DLP_PATH?.trim() || 'yt-dlp';
  const downloadToken = process.env.DOWNLOAD_TOKEN?.trim() || undefined;
  const webDistDir =
    process.env.WEB_DIST_DIR?.trim() || join(process.cwd(), 'web', 'dist');
  return { port, mediaRoot, ytdlpPath, downloadToken, webDistDir };
}

export function tmpDownloadRoot(mediaRoot: string): string {
  return join(mediaRoot, '.tmp');
}

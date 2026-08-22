import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  withYtdlpPlayerClientFallback,
  ytdlpProcessEnv,
  ytdlpSharedArgs,
} from './ytdlp-common.js';

export function resolveYtdlpPath(configured = 'yt-dlp'): string {
  const candidates = [
    configured,
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes('/') || candidate.startsWith('.')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
  }
  return 'yt-dlp';
}

const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function isValidYoutubeVideoId(videoId: string): boolean {
  return YOUTUBE_VIDEO_ID_RE.test(videoId);
}

export type YtdlpProgress = {
  percent: number;
  stage: string;
};

const DOWNLOAD_PCT_RE = /\[download\]\s+(\d+(?:\.\d+)?)%/;

export function parseYtdlpProgressLine(line: string): YtdlpProgress | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const pct = trimmed.match(DOWNLOAD_PCT_RE);
  if (pct) {
    const percent = Math.min(99, Math.max(0, Number.parseFloat(pct[1] ?? '0')));
    return { percent, stage: 'downloading' };
  }
  if (/\[Merger\]|Merging formats/i.test(trimmed)) {
    return { percent: 92, stage: 'merging' };
  }
  return null;
}

function runYtdlpSpawn(
  ytdlpPath: string,
  args: string[],
  timeoutMs: number,
  onProgress?: (progress: YtdlpProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveYtdlpPath(ytdlpPath), args, {
      env: ytdlpProcessEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const onData = (buf: Buffer) => {
      const text = buf.toString();
      log += text;
      if (log.length > 120_000) log = log.slice(-60_000);
      for (const line of text.split(/\r?\n/)) {
        const progress = parseYtdlpProgressLine(line);
        if (progress) onProgress?.(progress);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('video_extract_timeout'));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(log.slice(-3500) || `yt-dlp_exit_${code ?? 'unknown'}`));
    });
  });
}

export type YoutubeVideoExtractResult = {
  filePath: string;
  title: string | null;
};

export async function extractYoutubeVideoMp4(
  videoId: string,
  workDir: string,
  ytdlpPath = 'yt-dlp',
  onProgress?: (progress: YtdlpProgress) => void,
): Promise<YoutubeVideoExtractResult> {
  if (!isValidYoutubeVideoId(videoId)) {
    throw new Error('invalid_video_id');
  }

  const outputTemplate = join(workDir, 'video.%(ext)s');
  const titleFile = join(workDir, 'title.txt');
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const formatAttempts = [
    'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b',
    'b/best',
    '18/22/best[height<=720]/best',
  ];

  await withYtdlpPlayerClientFallback(async (playerClient) => {
    let lastError: unknown;
    for (const format of formatAttempts) {
      try {
        await unlink(titleFile).catch(() => undefined);
        const leftover = await readdir(workDir).catch(() => [] as string[]);
        await Promise.all(
          leftover
            .filter((name) => name.startsWith('video.'))
            .map((name) => unlink(join(workDir, name)).catch(() => undefined)),
        );
        onProgress?.({ percent: 1, stage: 'starting' });
        await runYtdlpSpawn(
          ytdlpPath,
          [
            '-f',
            format,
            '--merge-output-format',
            'mp4',
            '--remux-video',
            'mp4',
            '--progress',
            '--newline',
            '--print-to-file',
            '%(title)s',
            titleFile,
            '-o',
            outputTemplate,
            ...ytdlpSharedArgs(playerClient),
            url,
          ],
          900_000,
          onProgress,
        );
        return;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  });

  const files = await readdir(workDir);
  const mp4 =
    files.find((name) => name.endsWith('.mp4')) ?? files.find((name) => name.startsWith('video.'));
  if (!mp4) throw new Error('video_extract_failed');
  let title: string | null = null;
  try {
    const raw = await readFile(titleFile, 'utf8');
    title = raw.trim() || null;
  } catch {
    title = null;
  }
  return { filePath: join(workDir, mp4), title };
}

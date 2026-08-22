/** 遇 403/429 时依次尝试的 YouTube player_client */
export const YTDLP_PLAYER_CLIENT_FALLBACKS = [
  'android,web',
  'tv_embedded,web',
  'mweb,web',
  'web',
] as const;

export const YTDLP_TOOL_PATH =
  '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH ?? '');

export function ytdlpProcessEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: YTDLP_TOOL_PATH };
}

export function isRetryableYtdlpError(message: string): boolean {
  return /403|429|forbidden|too many requests|sign in to confirm|video unavailable|requested format is not available|nsig|sabr|signature extraction|no video formats|http error 400|unable to download webpage|this video is not available|only images are available/i.test(
    message,
  );
}

export function ytdlpCookiesFromBrowserArg(): string[] {
  const browser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim();
  if (!browser) return [];
  return ['--cookies-from-browser', browser];
}

export function ytdlpPlayerClientArg(playerClient: string): string[] {
  return ['--extractor-args', `youtube:player_client=${playerClient}`];
}

export function ytdlpReliabilityArgs(): string[] {
  const sleepSec = process.env.YT_DLP_SLEEP_REQUESTS?.trim() || '0.75';
  return [
    '--retries',
    '5',
    '--fragment-retries',
    '10',
    '--socket-timeout',
    '30',
    '--sleep-requests',
    sleepSec,
    '--js-runtimes',
    'node',
    '--force-overwrites',
  ];
}

export function ytdlpSharedArgs(playerClient?: string): string[] {
  const args = [
    ...ytdlpReliabilityArgs(),
    ...ytdlpCookiesFromBrowserArg(),
    '--no-playlist',
    '--no-warnings',
  ];
  if (playerClient) {
    args.push(...ytdlpPlayerClientArg(playerClient));
  }
  return args;
}

export function ytdlpPlayerClientChain(): string[] {
  const custom = process.env.YT_DLP_PLAYER_CLIENT?.trim();
  const chain: string[] = custom
    ? [custom, ...YTDLP_PLAYER_CLIENT_FALLBACKS.filter((c) => c !== custom)]
    : [...YTDLP_PLAYER_CLIENT_FALLBACKS];
  return chain;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withYtdlpPlayerClientFallback<T>(
  run: (playerClient: string) => Promise<T>,
): Promise<T> {
  const chain = ytdlpPlayerClientChain();
  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const client = chain[i]!;
    try {
      return await run(client);
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!isRetryableYtdlpError(msg) || i === chain.length - 1) {
        throw e;
      }
      await sleep(2000 * (i + 1));
    }
  }
  throw lastError;
}

export function classifyYtdlpError(
  message: string,
  fallback: 'video_extract_failed' | 'audio_extract_failed' = 'video_extract_failed',
): string {
  if (/403|forbidden/i.test(message)) return 'youtube_download_forbidden';
  if (/429|too many requests/i.test(message)) return 'youtube_rate_limited';
  if (/ENAMETOOLONG|name too long|file name too long/i.test(message)) return 'download_path_too_long';
  if (/ENOSPC|no space left/i.test(message)) return 'download_disk_full';
  if (/nsig|signature extraction/i.test(message)) return 'youtube_signature_failed';
  if (/requested format is not available|no video formats|only images are available/i.test(message)) {
    return 'youtube_format_unavailable';
  }
  if (message === 'invalid_video_id') return 'invalid_video_id';
  if (message === 'video_extract_timeout') return 'video_extract_timeout';
  if (message.includes('ffmpeg') || message.includes('ffprobe')) return 'ffmpeg_not_installed';
  if (message.includes('ENOENT') || message.includes('not found')) return 'ytdlp_not_installed';
  return fallback;
}

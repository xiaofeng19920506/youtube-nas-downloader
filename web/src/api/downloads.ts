export type ShareInfo = {
  name: string;
  path: string;
};

export type DownloadJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type DownloadJob = {
  jobId: string;
  videoId: string;
  title?: string;
  shareName?: string;
  subfolder?: string;
  status: DownloadJobStatus;
  percent: number;
  stage: string;
  queuePosition: number;
  nasPath?: string;
  filename?: string;
  error?: string;
  errorDetail?: string;
  createdAt: number;
};

const ERROR_LABELS: Record<string, string> = {
  invalid_youtube_url: '无效的 YouTube 链接或视频 ID',
  invalid_video_id: '无效的视频 ID',
  invalid_share: '请选择共享文件夹',
  invalid_subfolder: '子文件夹名称无效',
  share_not_found: '共享文件夹不存在',
  no_shares: '未找到共享文件夹，请挂载 SHARES_ROOT（例如 /vol1/1000）',
  download_failed: '下载失败，请稍后重试',
  youtube_download_forbidden: 'YouTube 拒绝下载（403），可在服务器设置 YT_DLP_COOKIES_FROM_BROWSER',
  youtube_rate_limited: '请求过于频繁，请稍后再试',
  youtube_signature_failed: 'YouTube 签名校验失败，请更新 yt-dlp',
  youtube_format_unavailable: '没有可用的视频格式',
  video_extract_failed: '视频提取失败',
  video_extract_timeout: '下载超时',
  ytdlp_not_installed: '服务器未安装 yt-dlp',
  ffmpeg_not_installed: '服务器未安装 ffmpeg',
  download_disk_full: '磁盘空间不足',
  download_path_too_long: '保存路径过长',
  unauthorized: '未授权，请检查 DOWNLOAD_TOKEN',
};

export function friendlyError(code: string): string {
  return ERROR_LABELS[code] ?? code;
}

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  if (typeof data === 'object' && data && 'error' in data) {
    return String((data as { error: string }).error);
  }
  return res.statusText || 'download_failed';
}

export async function listShares(): Promise<ShareInfo[]> {
  const res = await fetch('/v1/shares');
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { shares: ShareInfo[] };
  return data.shares ?? [];
}

export async function listDownloadJobs(): Promise<DownloadJob[]> {
  const res = await fetch('/v1/admin/downloads/jobs');
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { jobs: DownloadJob[] };
  return data.jobs ?? [];
}

export async function startVideoJob(
  videoId: string,
  title: string,
  share: string,
  subfolder?: string,
): Promise<DownloadJob> {
  const res = await fetch(`/v1/youtube/videos/${encodeURIComponent(videoId)}/video/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      share,
      subfolder: subfolder?.trim() || undefined,
    }),
  });
  if (!res.ok && res.status !== 202) throw new Error(await readError(res));
  return res.json() as Promise<DownloadJob>;
}

export async function retryDownloadJob(jobId: string): Promise<DownloadJob> {
  const res = await fetch(`/v1/admin/downloads/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
  });
  if (!res.ok && res.status !== 202) throw new Error(await readError(res));
  return res.json() as Promise<DownloadJob>;
}

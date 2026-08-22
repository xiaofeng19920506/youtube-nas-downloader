import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerEnv } from './env.js';
import { tmpDownloadRoot } from './env.js';
import { resolveSharePath } from './shares.js';
import { sanitizeNasFileStem, sanitizeNasFolderName } from './ytdlp/media-folders.js';
import { classifyYtdlpError } from './ytdlp/ytdlp-common.js';
import { extractYoutubeVideoMp4 } from './ytdlp/video-extract.js';

const MAX_PARALLEL_DOWNLOADS = 3;
const JOB_TTL_MS = 6 * 60 * 60_000;

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

function safeBasename(title: string | undefined, videoId: string): string {
  return sanitizeNasFileStem(title?.trim() || videoId, videoId);
}

export function createJobRunner(env: ServerEnv) {
  const mediaRoot = env.mediaRoot;
  const sharesRoot = env.sharesRoot;
  const jobs = new Map<string, DownloadJob>();
  const waitQueue: string[] = [];
  let running = 0;

  const publicJob = (job: DownloadJob): DownloadJob => {
    const queuedAhead = waitQueue.indexOf(job.jobId);
    return {
      ...job,
      queuePosition:
        job.status === 'queued' ? (queuedAhead >= 0 ? queuedAhead + 1 : 1) : 0,
    };
  };

  const listJobs = () =>
    [...jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 40)
      .map(publicJob);

  const prune = () => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
      if ((job.status === 'done' || job.status === 'failed') && job.createdAt < cutoff) {
        jobs.delete(id);
      }
    }
  };

  const runMp4 = async (job: DownloadJob) => {
    const shareName = job.shareName?.trim();
    if (!shareName) throw new Error('invalid_share');
    job.stage = 'starting';
    job.percent = 1;
    const tmpRoot = tmpDownloadRoot(mediaRoot);
    await mkdir(tmpRoot, { recursive: true });
    const tmpDir = await mkdtemp(join(tmpRoot, 'yt-video-'));
    try {
      const extracted = await extractYoutubeVideoMp4(
        job.videoId,
        tmpDir,
        env.ytdlpPath,
        (progress) => {
          if (job.status !== 'running') return;
          job.percent = Math.max(job.percent, progress.percent);
          job.stage = progress.stage;
        },
      );
      job.percent = 96;
      job.stage = 'saving';
      const youtubeTitle = extracted.title || job.title;
      const subfolderRaw = job.subfolder?.trim();
      const subfolder = subfolderRaw ? sanitizeNasFolderName(subfolderRaw) : undefined;
      const filename = `${safeBasename(youtubeTitle, job.videoId)}.${job.videoId}.mp4`;
      const dir = await resolveSharePath(sharesRoot, shareName, subfolder);
      await mkdir(dir, { recursive: true });
      await copyFile(extracted.filePath, join(dir, filename));
      job.filename = filename;
      job.nasPath = subfolder
        ? `${shareName}/${subfolder}/${filename}`
        : `${shareName}/${filename}`;
      job.percent = 100;
      job.stage = 'done';
      job.status = 'done';
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };

  const pump = () => {
    prune();
    while (running < MAX_PARALLEL_DOWNLOADS && waitQueue.length > 0) {
      const jobId = waitQueue.shift();
      if (!jobId) break;
      const job = jobs.get(jobId);
      if (!job || job.status !== 'queued') continue;
      running += 1;
      job.status = 'running';
      job.stage = 'starting';
      job.queuePosition = 0;
      void (async () => {
        try {
          await runMp4(job);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'download_failed';
          job.status = 'failed';
          job.stage = 'failed';
          job.error = classifyYtdlpError(message, 'video_extract_failed');
          job.errorDetail = message.replace(/\s+/g, ' ').trim().slice(-280);
        } finally {
          running -= 1;
          pump();
        }
      })();
    }
  };

  const enqueue = (input: {
    videoId: string;
    title?: string;
    shareName: string;
    subfolder?: string;
  }): DownloadJob => {
    prune();
    const job: DownloadJob = {
      jobId: randomUUID(),
      videoId: input.videoId,
      title: input.title,
      shareName: input.shareName,
      subfolder: input.subfolder,
      status: 'queued',
      percent: 0,
      stage: 'queued',
      queuePosition: waitQueue.length + 1,
      createdAt: Date.now(),
    };
    jobs.set(job.jobId, job);
    waitQueue.push(job.jobId);
    pump();
    return publicJob(job);
  };

  const retry = (jobId: string): { job?: DownloadJob; error?: string } => {
    prune();
    const job = jobs.get(jobId);
    if (!job) return { error: 'not_found' };
    if (job.status === 'queued' || job.status === 'running') return { job: publicJob(job) };
    if (job.status !== 'failed') return { error: 'retry_not_allowed' };
    job.status = 'queued';
    job.percent = 0;
    job.stage = 'queued';
    job.error = undefined;
    job.errorDetail = undefined;
    job.nasPath = undefined;
    job.filename = undefined;
    job.createdAt = Date.now();
    waitQueue.push(job.jobId);
    pump();
    return { job: publicJob(job) };
  };

  return {
    enqueue,
    retry,
    listJobs,
    getJob: (jobId: string) => {
      const job = jobs.get(jobId);
      return job ? publicJob(job) : undefined;
    },
  };
}

export type JobRunner = ReturnType<typeof createJobRunner>;

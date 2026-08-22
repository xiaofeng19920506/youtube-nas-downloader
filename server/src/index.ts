import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createJobRunner } from './download-jobs.js';
import { loadEnv } from './env.js';
import {
  mediaFolderById,
  parseMediaFolderId,
} from './ytdlp/media-folders.js';
import { isValidYoutubeVideoId } from './ytdlp/video-extract.js';

const env = loadEnv();
const runner = createJobRunner(env);

const app = Fastify({ logger: true });

app.addHook('onRequest', async (request, reply) => {
  if (!env.downloadToken) return;
  const path = request.url.split('?')[0] ?? '';
  if (path === '/health' || path.startsWith('/assets/') || path === '/') return;
  const header = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const query = (request.query as { token?: string })?.token;
  if (header === env.downloadToken || query === env.downloadToken) return;
  return reply.code(401).send({ error: 'unauthorized' });
});

app.get('/health', async () => ({ ok: true }));

app.get('/v1/admin/downloads/jobs', async () => ({
  maxParallel: 3,
  jobs: runner.listJobs(),
}));

app.get<{ Params: { jobId: string } }>('/v1/admin/downloads/jobs/:jobId', async (request, reply) => {
  const job = runner.getJob(request.params.jobId);
  if (!job) return reply.code(404).send({ error: 'not_found' });
  return job;
});

app.post<{ Params: { jobId: string } }>(
  '/v1/admin/downloads/jobs/:jobId/retry',
  async (request, reply) => {
    const result = runner.retry(request.params.jobId);
    if (result.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
    if (result.error) return reply.code(400).send({ error: result.error });
    return reply.code(202).send(result.job);
  },
);

app.post<{
  Params: { videoId: string };
  Body: { title?: string; folder?: string; series?: string };
}>('/v1/youtube/videos/:videoId/video/download', async (request, reply) => {
  const videoId = request.params.videoId;
  if (!isValidYoutubeVideoId(videoId)) {
    return reply.code(400).send({ error: 'invalid_video_id' });
  }
  const folderId = parseMediaFolderId(request.body?.folder);
  if (!folderId) {
    return reply.code(400).send({ error: 'invalid_download_folder' });
  }
  const folder = mediaFolderById(folderId);
  const job = runner.enqueue({
    videoId,
    title: request.body?.title?.trim() || videoId,
    folder: folderId,
    folderLabel: folder.dirName,
    seriesName: request.body?.series?.trim() || undefined,
  });
  return reply.code(202).send(job);
});

async function start() {
  await mkdir(env.mediaRoot, { recursive: true });
  if (existsSync(env.webDistDir)) {
    await app.register(fastifyStatic, {
      root: env.webDistDir,
      prefix: '/',
    });
    app.setNotFoundHandler(async (_request, reply) => {
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn(`Web dist not found at ${env.webDistDir}; API only mode`);
  }
  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`Media root: ${env.mediaRoot}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

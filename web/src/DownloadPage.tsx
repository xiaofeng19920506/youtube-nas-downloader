import { useEffect, useState } from 'react';
import {
  friendlyError,
  listDownloadJobs,
  listShares,
  retryDownloadJob,
  startVideoJob,
  type DownloadJob,
  type ShareInfo,
} from './api/downloads';
import { normalizeYoutubeVideoId } from './lib/youtube-video-id';

function jobStatusText(job: DownloadJob): string {
  if (job.status === 'queued') {
    return `排队等待中（第 ${job.queuePosition || 1} 位，同时最多 3 个）`;
  }
  if (job.status === 'done' && job.nasPath) {
    return `已保存到 NAS：${job.nasPath}`;
  }
  if (job.status === 'failed') {
    return friendlyError(job.error || 'download_failed');
  }
  if (job.stage === 'merging') return '正在合并视频…';
  if (job.stage === 'saving') return '正在写入 NAS…';
  if (job.stage === 'downloading') return `下载中 ${Math.round(job.percent)}%`;
  return `处理中 ${Math.round(job.percent)}%`;
}

export default function DownloadPage() {
  const [input, setInput] = useState('');
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [sharesLoaded, setSharesLoaded] = useState(false);
  const [share, setShare] = useState('');
  const [subfolder, setSubfolder] = useState('');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [jobTab, setJobTab] = useState<'active' | 'done'>('active');

  const activeJobs = jobs.filter((job) => job.status !== 'done');
  const doneJobs = jobs.filter((job) => job.status === 'done');
  const visibleJobs = jobTab === 'active' ? activeJobs : doneJobs;
  const activeCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  const hasShares = shares.length > 0;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await listShares();
        if (cancelled) return;
        setShares(next);
        setShare((prev) => {
          if (prev && next.some((s) => s.name === prev)) return prev;
          return next[0]?.name ?? '';
        });
      } catch {
        if (!cancelled) setShares([]);
      } finally {
        if (!cancelled) setSharesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await listDownloadJobs();
        if (!cancelled) setJobs(next);
      } catch {
        // keep last snapshot
      }
    };
    void refresh();
    if (activeCount === 0) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeCount]);

  const enqueue = async () => {
    const videoId = normalizeYoutubeVideoId(input);
    if (!videoId) {
      setError(friendlyError('invalid_youtube_url'));
      return;
    }
    if (!share) {
      setError(friendlyError(hasShares ? 'invalid_share' : 'no_shares'));
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const job = await startVideoJob(videoId, videoId, share, subfolder);
      setJobs((prev) => [job, ...prev.filter((row) => row.jobId !== job.jobId)]);
      setJobTab('active');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'download_failed'));
    } finally {
      setStarting(false);
    }
  };

  const retryJob = async (job: DownloadJob) => {
    setRetryingId(job.jobId);
    setError(null);
    try {
      const next = await retryDownloadJob(job.jobId);
      setJobs((prev) => [next, ...prev.filter((row) => row.jobId !== next.jobId)]);
      setJobTab('active');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'download_failed'));
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section className="download-section">
      <p className="download-intro">
        粘贴 YouTube 链接，选择共享文件夹；可选填写子文件夹（剧名等）。视频将保存为 MP4。
      </p>
      <label className="download-field">
        <span>YouTube 链接或视频 ID</span>
        <input
          type="text"
          value={input}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=… 或 11 位 ID"
          disabled={starting || !hasShares}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      <label className="download-field">
        <span>保存到共享文件夹</span>
        {sharesLoaded && !hasShares ? (
          <p className="download-shares-empty">
            未找到共享文件夹。请挂载 SHARES_ROOT（例如 /vol1/1000），并在其下创建若干共享目录。
          </p>
        ) : (
          <select
            value={share}
            disabled={starting || !hasShares}
            onChange={(e) => setShare(e.target.value)}
          >
            {!hasShares ? <option value="">加载中…</option> : null}
            {shares.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        )}
      </label>
      {hasShares ? (
        <fieldset className="download-folders" disabled={starting}>
          <legend>共享文件夹</legend>
          <div className="download-folder-list">
            {shares.map((item) => (
              <label key={item.name} className="download-folder-option">
                <input
                  type="radio"
                  name="download-share"
                  value={item.name}
                  checked={share === item.name}
                  onChange={() => setShare(item.name)}
                />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="download-field">
        <span>剧名 / 子文件夹（可空）</span>
        <input
          type="text"
          value={subfolder}
          autoComplete="off"
          spellCheck={false}
          placeholder="例如：山河令。留空则直接保存到所选共享文件夹"
          disabled={starting || !hasShares}
          onChange={(e) => setSubfolder(e.target.value)}
        />
      </label>
      <div className="download-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={starting || !hasShares}
          onClick={() => void enqueue()}
        >
          {starting ? '正在提交…' : '保存视频到 NAS'}
        </button>
      </div>
      <p className="download-hint">可连续添加任务。同时最多下载 3 个，超出的会排队。</p>
      {error && <p className="error-msg">{error}</p>}
      <div className="download-jobs-panel">
        <div className="job-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={jobTab === 'active'}
            className={`job-tab${jobTab === 'active' ? ' active' : ''}`}
            onClick={() => setJobTab('active')}
          >
            正在下载 ({activeJobs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={jobTab === 'done'}
            className={`job-tab${jobTab === 'done' ? ' active' : ''}`}
            onClick={() => setJobTab('done')}
          >
            下载完成 ({doneJobs.length})
          </button>
        </div>
        <ul className="download-jobs">
          {visibleJobs.length === 0 ? (
            <li className="download-jobs-empty">
              {jobTab === 'active' ? '暂无进行中或失败的任务' : '暂无已完成的任务'}
            </li>
          ) : (
            visibleJobs.map((job) => (
              <li key={job.jobId} className={`download-job is-${job.status}`}>
                <div className="download-job-head">
                  <strong>
                    保存视频到 NAS
                    {job.shareName ? ` · ${job.shareName}` : ''}
                    {job.subfolder ? ` / ${job.subfolder}` : ''}
                  </strong>
                  <span>{job.videoId}</span>
                </div>
                <div
                  className="download-progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(job.percent)}
                >
                  <div
                    className="download-progress-bar"
                    style={{ width: `${job.status === 'queued' ? 0 : Math.max(2, job.percent)}%` }}
                  />
                </div>
                <div className="download-job-foot">
                  <div className="download-job-status-wrap">
                    <p className="download-job-status">
                      {job.status === 'failed'
                        ? friendlyError(job.error || 'download_failed')
                        : jobStatusText(job)}
                    </p>
                    {job.status === 'failed' && job.errorDetail ? (
                      <p className="download-job-detail">{job.errorDetail}</p>
                    ) : null}
                  </div>
                  {job.status === 'failed' && (
                    <button
                      type="button"
                      className="btn-sm"
                      disabled={retryingId === job.jobId}
                      onClick={() => void retryJob(job)}
                    >
                      {retryingId === job.jobId ? '正在重新排队…' : '重新下载'}
                    </button>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

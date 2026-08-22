const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function extractVideoIdFromUrl(input: string): string | null {
  const raw = input.trim();
  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const videoId = url.pathname.slice(1).split('/')[0] ?? '';
      return VIDEO_ID_RE.test(videoId) ? videoId : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const videoId = url.searchParams.get('v');
      if (videoId && VIDEO_ID_RE.test(videoId)) return videoId;

      const pathMatch = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch?.[1] && VIDEO_ID_RE.test(pathMatch[1])) return pathMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeYoutubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;
  return extractVideoIdFromUrl(trimmed);
}

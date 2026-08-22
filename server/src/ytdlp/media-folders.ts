export const MEDIA_FOLDER_IDS = ['movies', 'tv', 'shortdrama', 'videos', 'anime', 'variety'] as const;

export type MediaFolderId = (typeof MEDIA_FOLDER_IDS)[number];

export type MediaFolder = {
  id: MediaFolderId;
  dirName: string;
  nasLabel: string;
};

export const MEDIA_FOLDERS: MediaFolder[] = [
  { id: 'movies', dirName: '电影', nasLabel: '存储空间 1/影视/电影' },
  { id: 'tv', dirName: '电视剧', nasLabel: '存储空间 1/影视/电视剧' },
  { id: 'shortdrama', dirName: '短剧', nasLabel: '存储空间 1/影视/短剧' },
  { id: 'videos', dirName: '视频', nasLabel: '存储空间 1/影视/视频' },
  { id: 'anime', dirName: '动漫', nasLabel: '存储空间 1/影视/动漫' },
  { id: 'variety', dirName: '综艺', nasLabel: '存储空间 1/影视/综艺' },
];

export function parseMediaFolderId(raw: string | undefined): MediaFolderId | null {
  const value = raw?.trim();
  return MEDIA_FOLDER_IDS.find((id) => id === value) ?? null;
}

export function mediaFolderById(id: MediaFolderId): MediaFolder {
  const found = MEDIA_FOLDERS.find((item) => item.id === id);
  if (!found) throw new Error('invalid_download_folder');
  return found;
}

function truncateUtf8Bytes(value: string, maxBytes: number): string {
  const buf = Buffer.from(value, 'utf8');
  if (buf.length <= maxBytes) return value.trim();
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString('utf8').replace(/[.\s_-]+$/g, '').trim();
}

function stripYoutubeTitleNoise(title: string): string {
  return title
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/#/g, ' ')
    .replace(/\bshortstory\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeNasFolderName(name: string): string {
  const cleaned = name
    .replace(/[\r\n]/g, ' ')
    .replace(/[\\/:*?"<>|#]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateUtf8Bytes(cleaned, 72) || '未命名';
}

export function sanitizeNasFileStem(name: string, fallback: string): string {
  const cleaned = stripYoutubeTitleNoise(name)
    .replace(/[\r\n"/\\:*?<>|#]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.(mp3|mp4)$/i, '');
  return truncateUtf8Bytes(cleaned, 80) || fallback;
}

export function seriesFolderFromTitle(
  explicit: string | undefined,
  youtubeTitle: string | undefined,
  fallback: string,
): string {
  if (explicit?.trim()) return sanitizeNasFolderName(explicit);
  let t = stripYoutubeTitleNoise(youtubeTitle ?? '');
  t = t.replace(/第\s*\d+\s*[集话期部季]/g, ' ');
  t = t.replace(/\b(?:EP|E)\s*\d+\b/gi, ' ');
  t = t.replace(/[（(]\s*\d+\s*[)）]/g, ' ');
  t = t.replace(/\s+(?:4K|1080[Pp]|720[Pp]|高清|超清|蓝光|完整版|正片|预告|中字|生肉)\s*$/g, '');
  const sentence = (t.split(/[。！？!?]/)[0] ?? t).trim();
  const cut = (sentence.split(/[:：|_|—–]/)[0] ?? sentence).trim();
  return sanitizeNasFolderName(cut || youtubeTitle || fallback);
}

import { readdir, stat } from 'node:fs/promises';
import { basename, join, normalize, resolve, sep } from 'node:path';

export type ShareEntry = {
  name: string;
  path: string;
};

function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

function assertSafeSegment(segment: string, label: string): string {
  const value = segment.trim();
  if (!value) throw new Error(`invalid_${label}`);
  if (value === '.' || value === '..') throw new Error(`invalid_${label}`);
  if (value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error(`invalid_${label}`);
  }
  if (isHiddenName(value)) throw new Error(`invalid_${label}`);
  return value;
}

/** List first-level directories under sharesRoot (skip hidden / dot names). */
export async function listShares(sharesRoot: string): Promise<ShareEntry[]> {
  const root = resolve(sharesRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const shares: ShareEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (isHiddenName(entry.name)) continue;
    shares.push({
      name: entry.name,
      path: join(root, entry.name),
    });
  }
  shares.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return shares;
}

/**
 * Safely join sharesRoot / shareName / subPath?.
 * Rejects `..` and any path that escapes the share directory.
 * Verifies shareName exists as a directory under sharesRoot.
 */
export async function resolveSharePath(
  sharesRoot: string,
  shareName: string,
  subPath?: string,
): Promise<string> {
  const root = resolve(sharesRoot);
  const name = assertSafeSegment(shareName, 'share');
  const shareDir = join(root, name);
  const shareStat = await stat(shareDir).catch(() => null);
  if (!shareStat?.isDirectory()) {
    throw new Error('share_not_found');
  }

  if (subPath == null || !subPath.trim()) {
    return shareDir;
  }

  const parts = normalize(subPath)
    .split(/[/\\]+/)
    .filter((part) => part && part !== '.');
  for (const part of parts) {
    if (part === '..') throw new Error('invalid_subfolder');
    assertSafeSegment(part, 'subfolder');
  }

  const resolved = resolve(shareDir, ...parts);
  const prefix = root.endsWith(sep) ? root : root + sep;
  const sharePrefix = shareDir.endsWith(sep) ? shareDir : shareDir + sep;
  if (resolved !== shareDir && !resolved.startsWith(sharePrefix)) {
    throw new Error('invalid_subfolder');
  }
  if (!resolved.startsWith(prefix) && resolved !== root) {
    throw new Error('invalid_subfolder');
  }
  // Extra guard: basename of share must still match
  if (basename(shareDir) !== name) {
    throw new Error('invalid_share');
  }
  return resolved;
}

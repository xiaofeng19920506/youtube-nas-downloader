#!/usr/bin/env node
/**
 * 飞牛 fpk 打包：注入版本与 Docker Hub 镜像地址，复制 fpk/ 到 dist-fpk 并调用 fnpack。
 *
 * PowerShell:
 *   $env:DOCKERHUB_REPO="xiaofeng19920506/youtube-nas-dl"; node scripts/build-fpk.mjs
 */
import { execSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const FPK_SRC = join(PROJECT_ROOT, 'fpk');

const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));
const VERSION = process.env.FPK_VERSION || pkg.version || '1.0.0';
const IMAGE_TAG = process.env.FPK_IMAGE_TAG || VERSION;
const DOCKERHUB_REPO = process.env.DOCKERHUB_REPO;
const OUT_DIR = resolve(PROJECT_ROOT, process.env.FPK_OUT_DIR || 'dist-fpk');

if (!DOCKERHUB_REPO) {
  console.error('[fpk] 请设置 DOCKERHUB_REPO，例如 xiaofeng19920506/youtube-nas-dl');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const WORK_DIR = join(OUT_DIR, `youtube-nas-dl-${VERSION}`);
if (existsSync(WORK_DIR)) rmSync(WORK_DIR, { recursive: true, force: true });
cpSync(FPK_SRC, WORK_DIR, { recursive: true });

function inject(filePath, replacements) {
  let content = readFileSync(filePath, 'utf8');
  for (const [key, val] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }
  writeFileSync(filePath, content);
}

inject(join(WORK_DIR, 'manifest'), { VERSION });
inject(join(WORK_DIR, 'app', 'docker', 'docker-compose.yaml'), {
  IMAGE_TAG,
  DOCKERHUB_REPO,
});

const assetsIcon = join(PROJECT_ROOT, 'assets', 'icon-256.png');
const fallbackIcon = join(PROJECT_ROOT, 'fpk', 'ICON_256.PNG');
const srcIcon = existsSync(assetsIcon) ? assetsIcon : fallbackIcon;
if (!existsSync(srcIcon)) {
  console.error('[fpk] 缺少图标 assets/icon-256.png');
  process.exit(1);
}

const uiImages = join(WORK_DIR, 'app', 'ui', 'images');
mkdirSync(uiImages, { recursive: true });
for (const dest of [
  join(WORK_DIR, 'ICON.PNG'),
  join(WORK_DIR, 'ICON_256.PNG'),
  join(uiImages, 'icon_64.png'),
  join(uiImages, 'icon_256.png'),
]) {
  copyFileSync(srcIcon, dest);
}

try {
  for (const f of readdirSync(join(WORK_DIR, 'cmd'))) {
    chmodSync(join(WORK_DIR, 'cmd', f), 0o755);
  }
} catch {
  /* ignore on Windows */
}

function findFnpack() {
  const env = process.env.FNPACK_BIN;
  if (env && existsSync(env)) return env;
  for (const f of readdirSync(PROJECT_ROOT).filter((n) => n.toLowerCase().startsWith('fnpack'))) {
    return join(PROJECT_ROOT, f);
  }
  for (const c of [join(PROJECT_ROOT, 'fnpack.exe'), join(PROJECT_ROOT, 'fnpack')]) {
    if (existsSync(c)) return c;
  }
  return null;
}

let FNPACK = findFnpack();
if (!FNPACK) {
  console.error('[fpk] 未找到 fnpack。请从 https://developer.fnnas.com/docs/cli/fnpack/ 下载');
  process.exit(1);
}

if (process.platform === 'win32' && !/\.exe$/i.test(FNPACK)) {
  const exeCopy = join(OUT_DIR, 'fnpack.exe');
  copyFileSync(FNPACK, exeCopy);
  FNPACK = exeCopy;
}

console.log(`[fpk] manifest ${VERSION}，镜像 ${DOCKERHUB_REPO}:${IMAGE_TAG}`);
console.log(`[fpk] fnpack: ${FNPACK}`);

function listFpks(dir) {
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.fpk')));
}
const before = new Set([...listFpks(OUT_DIR), ...listFpks(WORK_DIR), ...listFpks(PROJECT_ROOT)]);

execSync(`"${FNPACK}" build -d "${WORK_DIR}"`, { stdio: 'inherit', cwd: OUT_DIR });

const after = [...listFpks(OUT_DIR), ...listFpks(WORK_DIR), ...listFpks(PROJECT_ROOT)];
const created = after.filter((f) => !before.has(f));
for (const name of created) {
  for (const dir of [OUT_DIR, WORK_DIR, PROJECT_ROOT]) {
    const src = join(dir, name);
    if (!existsSync(src)) continue;
    const dst = join(OUT_DIR, `youtube-nas-dl-${VERSION}.fpk`);
    if (resolve(src) !== resolve(dst)) copyFileSync(src, dst);
    console.log(`[fpk] 产物: ${dst}`);
    break;
  }
}

console.log('[fpk] 完成。飞牛：应用中心 → 手动安装 → 选择 .fpk');

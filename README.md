# YouTube 下载到 NAS

独立工具：粘贴 YouTube 链接，下载 MP4 到飞牛影视目录。  
从 [file-service](https://github.com/xiaofeng19920506/file-service) 管理页下载功能复制而来，**不修改 file-service**。

## 功能

- 粘贴 YouTube 链接或 11 位 video ID
- 选择影视分类（电影 / 电视剧 / 短剧 / 视频 / 动漫 / 综艺）
- 可选剧名/片名（同剧多集填相同名称）
- 最多 3 个任务并行，网页查看进度与重试
- 第一版仅 MP4 视频

## 目录结构

```
youtube-nas-downloader/
├── server/          # Fastify API + yt-dlp
├── web/             # Vite + React 单页
├── docker/          # Dockerfile + install-media.sh
├── fpk/             # 飞牛应用中心 fpk 源码（fnpack 打包用）
├── scripts/         # build-fpk.mjs
└── docker-compose.yml
```

## 本地开发

```bash
cd youtube-nas-downloader
npm install
npm run dev:server   # :4010
npm run dev:web      # :5173，代理 API
```

## Docker Compose（飞牛手动部署）

```bash
docker compose up -d --build
```

浏览器打开 `http://NAS_IP:4010`。视频默认写入 `./data/media/分类/剧名/`。

## 飞牛应用中心（fpk）

本项目按 [飞牛应用开放平台](https://developer.fnnas.com/) Docker 应用规范组织：

| 文件 | 说明 |
|------|------|
| [fpk/manifest](fpk/manifest) | 应用 ID、版本、显示名 |
| [fpk/config/privilege](fpk/config/privilege) | 运行用户 `docker-youtube-nas-dl` |
| [fpk/config/resource](fpk/config/resource) | docker-project + data-share |
| [fpk/cmd/main](fpk/cmd/main) | 状态检测（启停由应用中心管理） |
| [fpk/app/docker/docker-compose.yaml](fpk/app/docker/docker-compose.yaml) | 容器与卷 |
| [fpk/app/ui/config](fpk/app/ui/config) | 桌面入口 :4010 |

### 发布流程

1. **构建并推送镜像**（飞牛不会现场 build，需预构建镜像）：

```bash
docker build -f docker/Dockerfile -t xiaofeng19920506/youtube-nas-dl:1.0.0 .
docker push xiaofeng19920506/youtube-nas-dl:1.0.0
```

2. **下载 [fnpack](https://developer.fnnas.com/docs/cli/fnpack/)** 放到项目根目录（Windows 可改名为 `fnpack.exe`）

3. **打包 fpk**：

```powershell
$env:DOCKERHUB_REPO="xiaofeng19920506/youtube-nas-dl"
$env:FPK_VERSION="1.0.0"
$env:FPK_IMAGE_TAG="1.0.0"
npm run fpk:build
```

产物在 `dist-fpk/youtube-nas-dl-1.0.0.fpk`。

4. **飞牛安装**：应用中心 → 设置 → **手动安装** → 选择 `.fpk`

5. 安装后桌面会出现「YouTube下载」，点击在浏览器打开。

### 保存路径

- fpk 默认：`/var/apps/youtube-nas-dl/shares/youtube-nas-dl/media/分类/剧名/`
- 若要与系统「影视」目录打通，安装后在 Docker 项目里把卷改为：

```yaml
volumes:
  - /vol1/1000/影视:/data/media
```

（路径以飞牛文件管理器里复制的为准）

### 上架官方商店

注册 [飞牛开发者平台](https://developer.fnnas.com/)，提交审核。本地 fpk 手动安装无需审核。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `4010` | 服务端口 |
| `MEDIA_ROOT` | `/data/media` | MP4 保存根目录 |
| `YT_DLP_PATH` | `/usr/local/bin/yt-dlp` | yt-dlp 路径 |
| `DOWNLOAD_TOKEN` | 空 | 可选 Bearer 鉴权 |
| `YT_DLP_COOKIES_FROM_BROWSER` | 空 | YouTube 403 时在容器内不可用，需挂载 cookies 文件 |

## 与 file-service 的关系

- file-service **保留**原有 Admin 下载功能，本仓库为独立拷贝
- 无 Postgres / Redis / 登录，仅下载工具

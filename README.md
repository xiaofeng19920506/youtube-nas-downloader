# YouTube 下载到 NAS

飞牛 **fpk 小应用**：粘贴 YouTube 链接，从用户共享文件夹（「影视」「下载」等）中选择保存位置，下载 MP4。  
从 [file-service](https://github.com/xiaofeng19920506/file-service) 管理页下载功能复制而来，**不修改 file-service**。

## 功能

- 粘贴 YouTube 链接或 11 位 video ID
- 从已挂载的用户共享根下列出共享文件夹，选择保存位置（如影视、下载）
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

浏览器打开 `http://NAS_IP:4010`。  
本地用 `./data/shares` 模拟用户共享根；容器内 `SHARES_ROOT` / `MEDIA_ROOT` 为 `/data/shares`。

## 飞牛应用中心（fpk）

本项目按 [飞牛应用开放平台](https://developer.fnnas.com/) Docker 应用规范组织：

| 文件 | 说明 |
|------|------|
| [fpk/manifest](fpk/manifest) | 应用 ID、版本、显示名 |
| [fpk/config/privilege](fpk/config/privilege) | 运行用户 `docker-youtube-nas-dl` |
| [fpk/config/resource](fpk/config/resource) | docker-project + data-share（临时数据） |
| [fpk/cmd/main](fpk/cmd/main) | 状态检测（启停由应用中心管理） |
| [fpk/app/docker/docker-compose.yaml](fpk/app/docker/docker-compose.yaml) | 容器与卷 |
| [fpk/app/ui/config](fpk/app/ui/config) | 桌面入口 :4010 |

### 产品形态与保存位置

- 挂载飞牛**用户共享根**（常见路径 `/vol1/1000` → 容器 `/data/shares`）
- 用户在网页里从「影视」「下载」等共享文件夹中选择保存位置
- 应用 data-share `youtube-nas-dl` 挂到 `/data/app`，仅作临时数据；也可写在 `/data/shares/.youtube-nas-dl-tmp`
- **若 `/vol1/1000` 不对**：安装后打开 Docker 项目，把卷左侧路径改成文件管理器里复制的真实用户共享根

```yaml
volumes:
  - /真实用户共享根:/data/shares
```

### GitHub Actions

- `push` 到 `main`：自动 `npm run build`，并构建 Docker 镜像推送
- 若配置了 `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` → 推 Docker Hub
- 否则 → 推 **GHCR**：`ghcr.io/<owner>/youtube-nas-dl:latest`（及 `sha-*`）

### fpk 打包步骤

1. **确保镜像已推送**（飞牛不会现场 build；可用 GHCR 或 Docker Hub 上的 tag）
2. **下载 [fnpack](https://developer.fnnas.com/docs/cli/fnpack/)** 放到项目根目录（Windows 可改名为 `fnpack.exe`）
3. **打包**：

```powershell
$env:DOCKERHUB_REPO="ghcr.io/xiaofeng19920506/youtube-nas-dl"
$env:FPK_VERSION="1.0.0"
$env:FPK_IMAGE_TAG="latest"
npm run fpk:build
```

产物：`dist-fpk/youtube-nas-dl-1.0.0.fpk`。

4. **飞牛安装**：应用中心 → 左下角 **手动安装** → 选择 `.fpk`  
   也可直接下载已发布包：[v1.0.0 Release](https://github.com/xiaofeng19920506/youtube-nas-downloader/releases/tag/v1.0.0)
5. 桌面出现「YouTube下载」；核对共享根挂载后即可用

### 镜像公开（飞牛拉取必需）

CI 推送到 GHCR：`ghcr.io/xiaofeng19920506/youtube-nas-dl:latest`  

请打开 [Packages](https://github.com/users/xiaofeng19920506/packages/container/package/youtube-nas-dl) → Package settings → **Change visibility → Public**，否则飞牛装 fpk 时拉不到镜像。

### 上架官方应用商店

官方商店**不能**仅靠 GitHub 自动上架，需飞牛审核：

1. 打开 [飞牛应用开放平台](https://developer.fnnas.com/) 注册开发者（或加入飞牛开发者交流群）
2. 提交应用信息：名称「YouTube下载到NAS」、仓库与 [Release fpk](https://github.com/xiaofeng19920506/youtube-nas-downloader/releases/tag/v1.0.0)
3. 等待审核通过后才会出现在应用中心搜索里

在正式上架前，用户可用 **手动安装 fpk** 使用。

本地 fpk 手动安装无需审核。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `4010` | 服务端口 |
| `SHARES_ROOT` | （同 MEDIA_ROOT） | 用户共享根，用于列出共享文件夹 |
| `MEDIA_ROOT` | `/data/shares` | 下载目标根（与共享根一致） |
| `YT_DLP_PATH` | `/usr/local/bin/yt-dlp` | yt-dlp 路径 |
| `DOWNLOAD_TOKEN` | 空 | 可选 Bearer 鉴权 |
| `YT_DLP_COOKIES_FROM_BROWSER` | 空 | YouTube 403 时在容器内不可用，需挂载 cookies 文件 |

## 与 file-service 的关系

- file-service **保留**原有 Admin 下载功能，本仓库为独立拷贝
- 无 Postgres / Redis / 登录，仅下载工具

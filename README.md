# Co-design Workshop · 共创工作坊

线下主持的共创工作坊互动网页。参与者直接阅读参与说明、勾选同意、获得匿名 ID，然后完成小球导入、场景卡与困难卡创作及自由排布。无需主持端、管理口令或发布活动的操作。

## 启动

要求 Node.js 24：

```powershell
cd D:\aaaPHD27\HUAWEI\OCDESIGNWITHE
npm ci
npm run build
npm start
```

访问 http://localhost:3000 。开发时另开终端运行 `npm run dev`，Vite 将 API 转发至本地 3000 端口。修改后端后需重启后端。

应用内保留简明参与说明与勾选签署，说明内容位于 `server.ts` 的 `defaultConsent`。旧版未发布的出厂模板在启动时自动替换；历史签署快照保持不变。没有主持页面及管理 API，参与者无需等待发布即可进入。现场说明与活动节奏由主持人口头进行。

## 卡片和困难箱

- 五类卡片使用无描边、圆角、低饱和糖果色表面与柔和悬浮阴影；类型在左上，图标居中，内容在底部。
- 场景、困难、交互和 AI 图标来自用户的 `src/icon/` 原始 PNG。目录实际包含四组黑白图标；材料卡使用同风格的简洁文档形状。
- 鼠标悬停卡片轻微升起，单击翻面；拖动顶部排布，不误触翻转。背面可编辑与删除。键盘聚焦卡片顶部后，用方向键移动，Shift 增大步长。
- 先填写一张场景卡，再填写第一张困难卡。之后可继续添加困难、材料、交互与 AI 卡；场景限定一张。
- 右侧“困难箱”下方显示“没有想法，可以看看示例。”。关闭时示例收纳在盒内，展开时盒盖侧移、三张示例卡错落升起，反向收起沿同一路径平滑过渡。
- 鼠标悬停可展开，点击可固定或收起；触屏与键盘使用同一按钮操作。点击示例阅读完整背景与定义，不会添加到参与者作品中。减少动态效果设置下立即切换状态。

## 保存和研究数据

SQLite 默认保存至 `data/workshop.sqlite`。身份存于 HttpOnly cookie，同一浏览器重新打开或服务重启后可恢复。清除 cookie 或更换设备不会恢复身份。

每个参与者拥有独立画布。记录匿名 ID、签署时的说明与版本、阶段、卡片内容、坐标、层级和视图。服务器会在 `workspace_history` 与 `study_history` 中追加每次有效修订，当前状态仍保存在主表中以便快速恢复；升级旧数据库时会自动把当时的当前状态补为历史基线。新建输入草稿保留在本机，提交后写入服务器；有效的已创建卡片编辑在停止输入后自动同步，拖动结束立即保存。

断网时保留待同步草稿，联网后重试。多标签页版本冲突会暂停覆盖，允许下载本页草稿后加载最新数据。单工作区最多 100 张卡片，每字段最多 5000 字。逻辑画布 2000×1400，卡片 260×300，窗口尺寸不改变卡片坐标。

研究者可以在服务器上运行只读导出脚本获得 JSON 和 CSV：

```powershell
node scripts/export.mjs data exports
```

第一个参数为数据库目录，第二个为输出目录；均可省略。脚本只读数据库，不包含会话 token，并自动排除 `/solo` 产生的 `TEST-` 会话。JSON 保留完整布局、解法、批阅与同意快照；CSV 可按卡片或困难节点分析。研究数据目录和导出结果均不提交 Git。

另有不在参与者界面显示的 `/download` 下载页。部署时设置至少 24 字符的 `EXPORT_TOKEN`，研究者在该页输入密钥后可以下载上述研究文件，或生成一致性的完整 SQLite 灾备快照。密钥只保留在页面内存中；未配置时服务端会关闭下载接口。完整 SQLite 备份包含测试会话及会话凭据哈希，必须保存在受控位置，不能作为普通研究数据分享。

单人测试入口同样不在正式界面显示，仅可直接访问 `/solo`；它使用独立 cookie，且不会进入研究导出。

当前本机预览使用独立目录 `data/preview`，对应导出命令为 `node scripts/export.mjs data/preview exports`。

## GitHub App 与 Coolify

将本目录作为独立仓库根目录上传至 GitHub，再通过 Coolify GitHub App 创建 Application：

| 配置 | 值 |
| --- | --- |
| Build Strategy | Dockerfile |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `3000` |
| Health Check | `/health` |
| Domain | 你的 HTTPS 域名 |
| Persistent Volume Destination | `/app/data` |
| 实例数 | `1` |
| 环境变量 | `EXPORT_TOKEN=<至少 24 字符的随机密钥>` |

镜像设置 `PORT=3000`、`DATA_DIR=/app/data`、`NODE_ENV=production`，以非 root 用户运行。请在 Coolify 环境变量中另外设置强随机 `EXPORT_TOKEN`，不要写入仓库。生产使用 Secure cookie，需要 HTTPS。若项目在已有仓库子目录内，调整 Base Directory。

单实例 SQLite 使用 WAL、写入等待和乐观版本检查，支持本轮 4–6 人并发；不要将同一个数据库文件共享给多个应用副本。先配置持久卷再招募，避免重新部署丢失数据。持久卷不是备份，活动前后从 `/download` 下载完整 SQLite 快照，并复制到服务器之外。下载接口通过 SQLite `VACUUM INTO` 生成包含 WAL 已提交内容的一致快照，无需直接复制正在运行的数据库文件。

容器内导出：`docker exec <容器名> node scripts/export.mjs /app/data /app/data/export`，再用 `docker cp` 取出导出目录。

官方参考：[Dockerfile 部署](https://coolify.io/docs/applications/builds/dockerfile)、[持久存储](https://coolify.io/docs/core/persistent-storage/storage-mounts/overview)。

## 验证

```powershell
npm run build
npm test
npm run test:browser
docker build -t codesign-workshop:local .
node tests/docker.mjs
```

API 测试使用 3101 端口和临时数据库，验证同意门槛、六人并发、隔离、冲突、研究导出、完整备份可恢复与重启恢复。浏览器测试使用本机 Chrome，在 3102 端口完整验证创作、交叉解题、多份方案选择与逐份批阅、隐藏入口、下载页、离线恢复和响应式布局。可设置 `TEST_BROWSER_CHANNEL=msedge` 切换 Edge。临时数据库在测试结束后清理，截图输出到被 Git 忽略的 `test-results/`。

Docker 测试验证生产 cookie、非 root 用户、健康检查、导出脚本，以及容器替换后的持久卷恢复。

本轮卡片改版已通过构建、API 与 Chrome 测试。当前 Docker Desktop 引擎启动超时，新版镜像未在本机复测，部署前请运行上述 Docker 两条验证命令。

## 多阶段实验

同场参与者使用同一个链接，例如 `/?session=workshop-A`。每次实验使用新的 session 值，参与者使用各自的浏览器会话。省略 session 时按 UTC 日期分组。正式实验链接只发给实际参试者。参与者发布场景后，其他同组参与者可从场景库自由选择；同一场景允许收到多份解法，出题人先在方案列表查看提交者、修改状态和节点概览，再逐份进入批阅。

自主场景至少包含四个困难，困难沿时间线从左到右排列并进入三轨视图。预设练习 AI 配额为三张，交叉解题为两张。交互与 AI 轨合计至少一张即可覆盖节点，同一交互卡可以放入多个节点，AI 卡只能属于一个节点。每个返回方案的每个节点均采用 0–100 分评分并填写评语，可勾选采纳的卡片。编辑过已有解法卡的方案会在返回列表标记为“经历过修改”。

研究导出命令现在额外生成 `export_nodes_and_solutions.csv`、`export_ai_cards_hotspot.csv` 和 `export_peer_scenarios.csv`。JSON 中 studies 包含阶段、两套解法、已发布快照以及批阅。热点表按场景与困难节点统计已提交的 AI 卡数量。

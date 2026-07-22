# Clip Relay 网页部署教程（不用敲命令）

这份教程专门写给**不会编程、只会在网站上点按钮**的朋友。

> 本项目基于原开源项目改造：  
> https://github.com/paopaoandlingyia/clip-relay  
> 请向原作者致谢。

---

## 先看懂：最后会有两个网址

| 名称 | 作用 | 例子 |
|------|------|------|
| 网站地址 | 你平时打开的网页 | `https://clip-relay.pages.dev` |
| 接口地址 | 后台存数据/文件 | `https://clip-relay-api.xxx.workers.dev` |

- **网站** = Cloudflare **Pages**
- **接口** = Cloudflare **Worker**（代码在仓库的 `worker` 文件夹）

⚠️ 关键：  
**不要**把整个项目当成一个 Next.js Worker 部署。  
那样 Cloudflare 会自动跑 `npx wrangler deploy` / OpenNext，然后失败。

正确做法是：

1. 先准备 D1（数据库）
2. 再部署 **Worker 后台**（根目录必须是 `worker`）
3. 再部署 **Pages 前台**（输出目录是 `out`）
4. 把两边连起来

---

## 第 1 步：注册账号并上传代码

### 1.1 账号

- Cloudflare：https://dash.cloudflare.com/sign-up  
- GitHub：https://github.com/signup  

### 1.2 代码仓库

你已经完成了的话，可以跳过：

- 仓库示例：`https://github.com/yg8335266/clip-relay-lite`

确认仓库里能看到：

- `src/`
- `worker/`
- `package.json`
- `DEPLOY.zh-CN.md`

---

## 第 2 步：创建数据库 D1（必须）

1. Cloudflare 控制台 → **Storage & databases** / **Workers & Pages**
2. 进入 **D1**
3. **Create database**
4. 名称填：`clip-relay`
5. 创建

### 2.1 建表（只做一次）

进入数据库 → **Console**，粘贴下面 SQL 并执行：

```sql
CREATE TABLE IF NOT EXISTS ClipboardItem (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  fileName TEXT,
  fileSize INTEGER,
  sortWeight INTEGER NOT NULL DEFAULT 0,
  contentType TEXT,
  filePath TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clipboard_sort
  ON ClipboardItem(sortWeight DESC, createdAt DESC, id DESC);

CREATE TABLE IF NOT EXISTS ShareLink (
  token TEXT PRIMARY KEY NOT NULL,
  itemId TEXT NOT NULL,
  expiresAt INTEGER,
  maxDownloads INTEGER,
  downloadCount INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0,
  passwordHash TEXT,
  passwordPlain TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_item
  ON ShareLink(itemId);
```

---

## 第 3 步：部署后台 Worker（接口）

### 3.1 重要提醒

如果你之前已经创建过一个 Worker，并且日志里出现：

- `npm run build`
- `npx wrangler deploy`
- `OpenNext`
- `Framework: Next.js`

说明它连的是**整个仓库根目录**，这是错的。

正确后台只应该使用仓库里的 **`worker` 文件夹**。

### 3.2 推荐做法：新建一个干净的 Worker

1. Cloudflare → **Workers & Pages** → **Create**
2. 选择 **Workers**
3. 点 **Connect to Git / Import a repository**
4. 选择仓库：`clip-relay-lite`

### 3.3 构建设置（最关键）

尽量这样填：

| 项目 | 填什么 |
|------|--------|
| Project name | `clip-relay-api`（可改） |
| Root directory / 根目录 | **`worker`** |
| Build command | **留空** |
| Deploy command | 默认即可，不要改成针对 Next.js 的命令 |
| Framework | **不要选 Next.js** |

如果页面问你是不是 Next.js / OpenNext：

- 选 **No**
- 或改成普通 Worker

### 3.4 绑定 D1

Worker 创建后，进入这个 Worker → **Settings → Bindings**：

- 类型：D1
- 变量名：**`DB`**
- 数据库：`clip-relay`

### 3.5 设置密码

Settings → **Variables and Secrets** → 新增 Secret：

- 名称：`AUTH_PASSWORD`
- 值：你自己设的密码

### 3.6 部��并测试

部署成功后，打开：

```text
https://你的worker地址/api/health
```

应该看到类似：

```json
{"ok":true,"service":"clip-relay-worker","mode":"polling"}
```

看到这个，后台才算成功。

### 3.7 R2 要不要绑？

- **先不绑也可以**
- 不绑 R2：文字剪贴板能用，图片/文件上传不能用
- 以后要传图片，再补绑 R2：
  - 变量名：`FILES`
  - 桶名：`clip-relay-files`

---

## 第 4 步：部署前台 Pages（网站）

后台成功后，再部署网站。

1. Cloudflare → **Workers & Pages** → **Create**
2. 这次选 **Pages**
3. **Connect to Git**
4. 还是选同一个仓库：`clip-relay-lite`

### 4.1 Pages 设置（照抄）

| 项目 | 填什么 |
|------|--------|
| Project name | `clip-relay`（可改） |
| Production branch | `main` |
| Root directory | **留空** |
| Framework preset | **None**（不要选复杂 Next.js Worker） |
| Build command | `npm run build` |
| Build output directory | **`out`** |
| Deploy command | **必须留空** |

⚠️ 绝对不要填：

```text
npx wrangler deploy
```

### 4.2 环境变量

Pages → Settings → Environment variables，新增：

| 名称 | 值 |
|------|----|
| `NEXT_PUBLIC_API_BASE` | 你的 Worker 地址，例如 `https://clip-relay-api.xxx.workers.dev` |

注意：

- 不要末尾斜杠 `/`
- 先有 Worker 地址，再填这个

### 4.3 部署

点 Save and Deploy。

成功后会得到：

```text
https://xxx.pages.dev
```

---

## 第 5 步：允许网站访问后台

1. 回到 Worker 项目
2. Settings → Variables and Secrets
3. 新增：
   - 名称：`CORS_ORIGIN`
   - 值：你的 Pages 地址，例如 `https://xxx.pages.dev`
4. 保存并重新部署 Worker

---

## 第 6 步：开始使用

1. 打开 Pages 网站
2. 输入 `AUTH_PASSWORD`
3. 粘贴文字试试
4. 手机打开同一网址，约 2 秒内应能同步

---

## 你如果已经按旧教程建错了，怎么补救

### 情况 A：日志里有 `OpenNext` / `npx wrangler deploy`

说明当前这个项目**连错了根目录**。

处理：

1. 这个失败项目可以先停用/删掉，不要继续硬修
2. **重新建 Worker**，Root directory 一定填 **`worker`**
3. 再单独建 **Pages**，输出目录 **`out`**，Deploy command 留空

### 情况 B：Pages 已经构建成功，但后面 deploy 失败

说明网页其实已经打包成功了。  
去 Pages 设置里：

- Build output directory 改成 `out`
- Deploy command 清空
- 再重新部署

---

## 常见问题

### 1）登录 401

- Worker 是否设置了 `AUTH_PASSWORD`
- 改完后是否重新部署

### 2）网页能开，但没数据

- Pages 是否设置了 `NEXT_PUBLIC_API_BASE`
- 改完后是否重新部署 Pages
- Worker 的 `/api/health` 是否正常

### 3）上传图片失败

- 是否绑定了 R2（`FILES`）
- 没绑 R2 时，只能用文字

### 4）同步不是瞬间

正常。免费版大约 2 秒刷新一次。

---

## 致谢

本免费 Cloudflare 版本基于原项目改造：

- 原仓库：https://github.com/paopaoandlingyia/clip-relay

如果你愿意，请先给原项目点个 Star 支持作者。

# Clip Relay 网页部署教程（不用敲命令）

这份教程专门写给**不会编程、只会在网站上点按钮**的朋友。

你只需要：

1. 一个 **Cloudflare** 账号（免费）
2. 一个 **GitHub** 账号（免费，用来放项目文件）
3. 大约 30～60 分钟，慢慢点

> 本项目基于原开源项目改造：  
> https://github.com/paopaoandlingyia/clip-relay  
> 请向原作者致谢。

---

## 先看懂：最后会有两个网址

| 名称 | 作用 | 例子 |
|------|------|------|
| 网站地址 | 你平时打开的网页 | `https://clip-relay.pages.dev` |
| 接口地址 | 后台存数据/文件 | `https://clip-relay-api.xxx.workers.dev` |

- **网站**负责显示
- **接口**负责保存文字、图片、密码

两边都要部署好，网站才能正常用。

---

## 总流程（先记住这 6 步）

1. 把项目上传到 GitHub  
2. 在 Cloudflare 创建数据库（D1）  
3. 在 Cloudflare 创建文件仓库（R2）  
4. 部署后台接口（Workers）  
5. 部署前台网站（Pages）  
6. 把两边连起来（填接口地址 + 允许跨域）

下面一步一步来。

---

## 第 1 步：注册账号

### 1.1 注册 Cloudflare

打开：https://dash.cloudflare.com/sign-up  

用邮箱注册并登录。

### 1.2 注册 GitHub

打开：https://github.com/signup  

用邮箱注册并登录。

> 为什么要 GitHub？  
> 因为 Cloudflare 网页部署最省事的方式，就是“连接你的 GitHub 项目”，不用你在电脑上敲命令。

---

## 第 2 步：把本项目上传到 GitHub（网页上传）

### 2.1 新建仓库

1. 打开：https://github.com/new  
2. **Repository name** 填：`clip-relay`（可改）  
3. 选 **Public**  
4. **不要**勾选 “Add a README file”  
5. 点 **Create repository**

### 2.2 上传项目文件

1. 创建好后，页面会提示上传  
2. 点 **uploading an existing file**  
3. 把你电脑里的项目文件夹内容拖进去  
   - 也就是 `clip-relay-main` 里面的这些内容  
   - 例如：`src`、`worker`、`package.json`、`DEPLOY.zh-CN.md` 等  
4. 最下面写一句说明，例如：`upload project`  
5. 点 **Commit changes**

上传完成后，你的项目地址类似：

`https://github.com/你的用户名/clip-relay`

---

## 第 3 步：创建数据库 D1（存文字和记录）

1. 打开 Cloudflare 控制台：https://dash.cloudflare.com  
2. 左侧进入 **Workers & Pages**（有的界面叫 **Compute (Workers)**）  
3. 点 **D1**（或 **Storage & databases → D1**）  
4. 点 **Create database**  
5. 名称填：`clip-relay`  
6. 点创建

### 3.1 建表（很重要，只做一次）

1. 点进刚创建的数据库 `clip-relay`  
2. 找到 **Console**（控制台）  
3. 把下面整段 SQL **原样复制粘贴**进去，再点执行：

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

看到成功提示就行。

### 3.2 记下数据库 ID

在这个数据库页面里，找到 **Database ID**（一长串字符），先复制保存到记事本。  
后面部署 Worker 时可能用得上。

---

## 第 4 步：创建文件仓库 R2（存图片/文件）

1. Cloudflare 控制台 → **R2**  
2. 如果第一次用，按提示开通 R2（免费额度即可）  
3. 点 **Create bucket**  
4. 名称填：`clip-relay-files`  
5. 创建

> 桶名建议就用 `clip-relay-files`，和项目配置一致，少出错。

---

## 第 5 步：部署后台接口（Workers）

### 5.1 用 GitHub 创建 Worker

1. Cloudflare 控制台 → **Workers & Pages**  
2. 点 **Create**  
3. 选择 **Workers**  
4. 选 **Import a repository** / **Connect to Git**（连接 GitHub 仓库）  
5. 授权 Cloudflare 访问你的 GitHub  
6. 选择你刚上传的 `clip-relay` 仓库

### 5.2 关键设置（非常重要）

在构建设置里尽量这样填：

| 项目 | 填什么 |
|------|--------|
| 项目名 | `clip-relay-api`（可改） |
| 根目录 / Root directory | `worker` |
| 构建命令 | 可先留空，或按页面默认 |
| 部署命令 | 页面如果要求，按默认即可 |

> 关键意思：告诉 Cloudflare “后台代码在 `worker` 这个文件夹里”。

### 5.3 绑定 D1 和 R2

部署前后，在这个 Worker 的设置里找到 **Bindings（绑定）**：

#### 绑定数据库

- 类型：D1  
- 变量名 / Binding name：`DB`  
- 选择数据库：`clip-relay`

#### 绑定文件仓库

- 类型：R2  
- 变量名 / Binding name：`FILES`  
- 选择桶：`clip-relay-files`

> 名字必须是 `DB` 和 `FILES`，不能乱改。

### 5.4 设置密码（访问网页时要输入的密码）

还是在这个 Worker 设置里：

1. 找到 **Variables and Secrets** / **环境变量与机密**  
2. 新增 **Secret**  
3. 名称：`AUTH_PASSWORD`  
4. 值：你自己设的密码（例如 `MyPass123!`）  
5. 保存

### 5.5 部署

点 **Save and Deploy** / **Deploy**。

成功后会得到接口地址，类似：

`https://clip-relay-api.你的账号.workers.dev`

**先复制保存这个地址。**

### 5.6 测试后台是否成功

浏览器打开：

`https://你的接口地址/api/health`

如果看到类似：

```json
{"ok":true,"service":"clip-relay-worker","mode":"polling"}
```

就说明后台成功了。

---

## 第 6 步：部署前台网站（Pages）

### 6.1 创建 Pages 项目

1. Cloudflare 控制台 → **Workers & Pages**  
2. 点 **Create**  
3. 选择 **Pages**  
4. 选 **Connect to Git**  
5. 还是选同一个 GitHub 仓库 `clip-relay`

### 6.2 构建设置

按下面填：

| 项目 | 填什么 |
|------|--------|
| 项目名 | `clip-relay`（可改） |
| 生产分支 | `main` 或 `master`（看你仓库默认是哪个） |
| 根目录 | `/`（项目根目录，不要填 worker） |
| Framework preset | 可选 Next.js；没有就 None |
| Build command | `npm run build` |
| Build output directory | `out` |

### 6.3 环境变量（关键）

在 Pages 的 **Environment variables** 里新增：

| 名称 | 值 |
|------|----|
| `NEXT_PUBLIC_API_BASE` | 你的 Worker 地址，例如 `https://clip-relay-api.xxx.workers.dev` |

注意：

- 不要末尾斜杠 `/`
- 必须是第 5 步得到的接口地址

### 6.4 开始部署

点 **Save and Deploy**。

等几分钟，成功后会得到网站地址，类似：

`https://clip-relay.pages.dev`

---

## 第 7 步：允许网站访问后台（跨域设置）

因为网站和接口是两个不同地址，还要告诉后台“允许这个网站访问我”。

1. 回到 Worker 项目 `clip-relay-api`  
2. **Settings → Variables and Secrets**  
3. 新增变量：  
   - 名称：`CORS_ORIGIN`  
   - 值：你的网站地址，例如 `https://clip-relay.pages.dev`  
4. 保存后重新部署一次 Worker

---

## 第 8 步：开始使用

1. 打开你的网站地址（Pages）  
2. 输入你设置的 `AUTH_PASSWORD`  
3. 粘贴一段文字，或上传一张小图片  
4. 手机浏览器打开同一个网站，输入同样密码  
5. 大约 2 秒内，应该能看到同步

---

## 如果页面按钮名字不完全一样

Cloudflare 网页经常改版，按钮文字可能略有不同。  
你只要抓住这几个关键词：

- **Workers & Pages**
- **D1**
- **R2**
- **Bindings / 绑定**
- **Variables / Secrets / 环境变量**
- **Connect to Git / 连接 GitHub**
- **Deploy / 部署**

找不到时，用控制台顶部搜索框搜：`D1`、`R2`、`Workers`、`Pages`。

---

## 常见问题（照着排查）

### 1）网站能开，但登录失败 / 401

- 检查 Worker 里是否设置了 `AUTH_PASSWORD`
- 密码是否输错
- 改完 Secret 后有没有重新部署 Worker

### 2）网站能开，但列表一直空 / 加载失败

- Pages 环境变量 `NEXT_PUBLIC_API_BASE` 是否填对
- 改完后必须 **重新部署 Pages**
- 浏览器打开 `接口地址/api/health` 是否正常

### 3）上传图片失败

- R2 桶是否创建成功
- Worker 是否绑定了 `FILES` → `clip-relay-files`
- 文件是否太大（默认建议不超过 10MB）

### 4）分享链接打不开

- 同样依赖 Worker 接口
- 确认 `NEXT_PUBLIC_API_BASE` 正确
- 确认 Worker 正常

### 5）同步不是“瞬间出现”

正常。  
这个免费版大约每 **2 秒**自动刷新一次，不是原版那种立刻推送。

### 6）我不想用 GitHub，可以吗？

可以，但会麻烦很多，通常还是要命令行。  
**最推荐还是：GitHub 网页上传 + Cloudflare 网页连接仓库。**

---

## 以后如何更新

1. 在 GitHub 网页上改文件 / 重新上传文件  
2. Cloudflare 一般会自动重新部署  
3. 如果没有自动部署，就到对应的 Workers / Pages 项目里点 **Retry deployment**

---

## 安全提醒

- 访问密码尽量复杂一点  
- 不要上传身份证、银行卡等敏感信息  
- 分享链接建议加密码或过期时间  

---

## 致谢

本免费 Cloudflare 版本基于原项目改造：

- 原仓库：https://github.com/paopaoandlingyia/clip-relay

如果你愿意，请先给原项目点个 Star 支持作者。

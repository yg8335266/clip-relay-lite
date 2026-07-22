# Clip Relay（Cloudflare 免费版）

跨设备云剪贴板。  
这个版本专门改成了 **Cloudflare 免费部署**：Pages + Workers + D1 + R2。

> 基于原开源项目 **Clip Relay**  
> 原仓库：https://github.com/paopaoandlingyia/clip-relay  
> 协议：MIT（见 `LICENSE`）

## 和原版的区别

| 原版 | 本版本 |
|------|--------|
| Docker + Rust 后端 | Cloudflare Workers 后端 |
| SQLite 本地文件 | Cloudflare D1 |
| 本地磁盘 / S3 存文件 | Cloudflare R2 |
| SSE 实时推送 | 约 **2 秒**自动刷新 |
| 需要服务器 / 容器平台 | 尽量完全免费 |

## 功能

- 文字剪贴板
- 图片 / 小文件上传（默认最大 **10MB**）
- 密码保护
- 分享链接（可设密码、过期、下载次数）
- 搜索、拖拽排序
- 多设备同步（自动轮询）

## 部署（推荐）

如果你**不会编程、只会在网站上点**，请直接看：

👉 **[DEPLOY.zh-CN.md](./DEPLOY.zh-CN.md)**

这是「纯网页操作」教程，不需要敲命令。

大致流程：

1. 把项目上传到 GitHub  
2. 在 Cloudflare 创建 D1、R2  
3. 用网页部署 Worker（后台）  
4. 用网页部署 Pages（前台）  
5. 填好接口地址和密码后即可使用  

## 致谢

非常感谢原作者与原项目 **Clip Relay**：

- https://github.com/paopaoandlingyia/clip-relay

本仓库主要做了「免费 Cloudflare 部署适配」，前端交互与产品思路来自原项目。  
若你喜欢这个项目，请优先给原作者点 Star 支持。

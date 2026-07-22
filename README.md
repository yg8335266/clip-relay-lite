# Clip Relay (Cloudflare free edition)

Cross-device cloud clipboard, modified for free Cloudflare deployment
(Pages + Workers + D1 + R2).

> Based on the original open-source project **Clip Relay**.  
> Original repository: https://github.com/paopaoandlingyia/clip-relay  
> License: MIT (see `LICENSE`)

## Deploy (beginner-friendly)

If you do **not** want to use the command line, follow the Chinese web-only guide:

- [DEPLOY.zh-CN.md](./DEPLOY.zh-CN.md)

It only uses the GitHub website + Cloudflare dashboard.

## What changed

- Backend rewritten as Cloudflare Workers (TypeScript)
- Database moved to Cloudflare D1
- File storage moved to Cloudflare R2
- Realtime SSE replaced with ~2s polling
- Docker / Rust server removed from this edition

## Features

- Text clipboard
- Image / small file upload (default max 10MB)
- Password protection
- Share links (optional password / expiry / max downloads)
- Search + drag-and-drop reorder
- Multi-device sync via polling

## Credits / Acknowledgements

Huge thanks to the original Clip Relay project and its author:

- https://github.com/paopaoandlingyia/clip-relay

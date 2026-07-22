/**
 * Clip Relay — Cloudflare Workers API
 * Compatible with the original frontend routes (auth / clipboard / share).
 * Realtime SSE is replaced by client-side polling.
 */

export interface Env {
  DB: D1Database;
  FILES?: R2Bucket;
  AUTH_PASSWORD?: string;
  AUTH_MAX_AGE_SECONDS?: string;
  AUTH_TOKEN_MAX_AGE_SECONDS?: string;
  MAX_FILE_SIZE_BYTES?: string;
  ALLOW_QUERY_AUTH?: string;
  CORS_ORIGIN?: string;
}

type ItemType = "TEXT" | "IMAGE" | "FILE";

interface ClipboardRow {
  id: string;
  type: ItemType;
  content: string | null;
  fileName: string | null;
  fileSize: number | null;
  sortWeight: number;
  contentType: string | null;
  filePath: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ShareRow {
  token: string;
  itemId: string;
  expiresAt: number | null;
  maxDownloads: number | null;
  downloadCount: number;
  revoked: number;
  passwordHash: string | null;
  passwordPlain: string | null;
  createdAt: number;
  updatedAt: number;
}

const AUTH_COOKIE = "auth";
const DEFAULT_MAX_FILE = 10 * 1024 * 1024; // 10MB
const DEFAULT_AUTH_MAX_AGE = 7 * 24 * 60 * 60;
const DEFAULT_TOKEN_MAX_AGE = 90 * 24 * 60 * 60;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await ensureSchema(env);
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request, env);
      }
      return withCors(await handle(request, env), request, env);
    } catch (err) {
      console.error(err);
      return withCors(json({ error: "Internal Server Error", detail: String(err) }, 500), request, env);
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  // Health
  if (method === "GET" && (path === "/api/health" || path === "/api/healthz")) {
    return json({ ok: true, service: "clip-relay-worker", mode: "polling" });
  }

  // Auth (public)
  if (method === "POST" && path === "/api/auth/verify") return authVerify(request, env);
  if (method === "POST" && path === "/api/auth/access-token") return authAccessToken(request, env);
  if (method === "POST" && path === "/api/auth/logout") return authLogout(request);

  // Public share routes
  {
    const m = path.match(/^\/api\/share\/([^/]+)(?:\/(verify|file|download|qr))?$/);
    if (m) {
      const token = decodeURIComponent(m[1]);
      const action = m[2] || "";
      if (method === "GET" && !action) return shareMeta(request, env, token);
      if (method === "POST" && action === "verify") return shareVerify(request, env, token);
      if (method === "GET" && action === "file") return shareFile(request, env, token, false);
      if (method === "GET" && action === "download") return shareFile(request, env, token, true);
      if (method === "GET" && action === "qr") return shareQr(request, env, token);
    }
  }

  // Protected API
  if (path.startsWith("/api/")) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) return auth.response;

    if (method === "GET" && path === "/api/events") {
      return json({ ok: true, mode: "polling", message: "Use list polling instead of SSE" });
    }

    if (method === "GET" && path === "/api/clipboard") return listClipboard(request, env);
    if (method === "POST" && path === "/api/clipboard") return createClipboard(request, env);
    if (method === "POST" && path === "/api/clipboard/reorder") return reorderClipboard(request, env);

    // Compatible with original frontend: /api/files/:id
    {
      const m = path.match(/^\/api\/files\/([^/]+)$/);
      if (m && method === "GET") {
        return getFile(request, env, decodeURIComponent(m[1]));
      }
    }

    {
      const m = path.match(/^\/api\/clipboard\/([^/]+)(?:\/(file|share))?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const action = m[2] || "";
        if (method === "GET" && !action) return getClipboard(request, env, id);
        if (method === "DELETE" && !action) return deleteClipboard(request, env, id);
        if (method === "GET" && action === "file") return getFile(request, env, id);
        if (method === "GET" && action === "share") return getItemShare(request, env, id);
        if (method === "PUT" && action === "share") return updateItemShare(request, env, id);
      }
    }
  }

  return json({ error: "Not Found" }, 404);
}

/* ================= helpers ================= */

async function ensureSchema(env: Env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ClipboardItem (
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
    )`),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_clipboard_sort ON ClipboardItem(sortWeight DESC, createdAt DESC, id DESC)`,
    ),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ShareLink (
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
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_share_item ON ShareLink(itemId)`),
  ]);
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function epochToIso(ts: number) {
  return new Date(ts * 1000).toISOString();
}

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function withCors(res: Response, request: Request, env: Env) {
  const reqOrigin = request.headers.get("Origin");
  const allow = env.CORS_ORIGIN || reqOrigin || "*";
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", allow);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Share-Password, X-Requested-With",
  );
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.append("Vary", "Origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function isHttps(request: Request) {
  const xf = (request.headers.get("x-forwarded-proto") || "").toLowerCase();
  if (xf === "https") return true;
  return new URL(request.url).protocol === "https:";
}

function setAuthCookie(_request: Request, env: Env, password: string) {
  const maxAge = Number(env.AUTH_MAX_AGE_SECONDS || DEFAULT_AUTH_MAX_AGE);
  // Cross-origin Pages -> Worker needs SameSite=None; Secure
  return `${AUTH_COOKIE}=${encodeURIComponent(password)}; Max-Age=${maxAge}; Path=/; SameSite=None; Secure; HttpOnly`;
}

function clearAuthCookie(_request: Request) {
  return `${AUTH_COOKIE}=; Max-Age=0; Path=/; SameSite=None; Secure; HttpOnly`;
}

function getPassword(env: Env) {
  return (env.AUTH_PASSWORD || "").trim();
}

function maxFileSize(env: Env) {
  return Number(env.MAX_FILE_SIZE_BYTES || DEFAULT_MAX_FILE);
}

function allowQueryAuth(env: Env) {
  const v = (env.ALLOW_QUERY_AUTH || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function randomUuid() {
  return crypto.randomUUID();
}

function randomToken(bytes = 18) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  // base64url without padding
  let s = btoa(String.fromCharCode(...arr));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sharePasswordHash(password: string, token: string) {
  // Match original Rust: sha256(password + "|" + token)
  return sha256Hex(`${password}|${token}`);
}

async function issueAccessToken(password: string, env: Env) {
  // Compatible with original Rust backend:
  // token = v1.{expiresAt}.{nonce}.{base64url(sha256(password + "|access-token|" + expiresAt + "." + nonce))}
  const exp = nowUnix() + Number(env.AUTH_TOKEN_MAX_AGE_SECONDS || DEFAULT_TOKEN_MAX_AGE);
  const nonce = randomToken(18);
  const payload = `${exp}.${nonce}`;
  const sig = await sha256Base64Url(`${password}|access-token|${payload}`);
  return { token: `v1.${payload}.${sig}`, exp };
}

async function verifyAccessToken(password: string, token: string) {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < nowUnix()) return false;
  const payload = `${parts[1]}.${parts[2]}`;
  const expect = await sha256Base64Url(`${password}|access-token|${payload}`);
  return timingSafeEqual(expect, parts[3]);
}

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  let s = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function extractBearer(request: Request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function isAuthorized(request: Request, env: Env) {
  const password = getPassword(env);
  if (!password) return true;

  const cookies = parseCookies(request.headers.get("Cookie"));
  if (cookies[AUTH_COOKIE] && timingSafeEqual(cookies[AUTH_COOKIE], password)) return true;

  const bearer = extractBearer(request);
  if (bearer) {
    if (timingSafeEqual(bearer, password)) return true;
    if (await verifyAccessToken(password, bearer)) return true;
  }

  if (allowQueryAuth(env)) {
    const q = new URL(request.url).searchParams.get("auth");
    if (q && timingSafeEqual(q, password)) return true;
  }
  return false;
}

async function requireAuth(
  request: Request,
  env: Env,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (await isAuthorized(request, env)) return { ok: true };
  return { ok: false, response: json({ error: "Unauthorized" }, 401) };
}

function itemJson(row: ClipboardRow) {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    fileName: row.fileName,
    fileSize: row.fileSize,
    sortWeight: row.sortWeight,
    contentType: row.contentType,
    createdAt: epochToIso(row.createdAt),
    updatedAt: epochToIso(row.updatedAt),
  };
}

/* ================= auth ================= */

async function authVerify(request: Request, env: Env) {
  const password = getPassword(env);
  if (!password) {
    return json({ error: "Authentication not configured on server" }, 500);
  }
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const input = String(body?.password || "");
  if (!timingSafeEqual(input, password)) {
    return json({ error: "Invalid password" }, 401);
  }
  const { token, exp } = await issueAccessToken(password, env);
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.append("Set-Cookie", setAuthCookie(request, env, password));
  return new Response(
    JSON.stringify({
      success: true,
      accessToken: token,
      accessTokenExpiresAt: epochToIso(exp),
    }),
    { status: 200, headers },
  );
}

async function authAccessToken(request: Request, env: Env) {
  const password = getPassword(env);
  if (!password) return json({ error: "Authentication not configured on server" }, 500);
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const { token, exp } = await issueAccessToken(password, env);
  return json({
    success: true,
    accessToken: token,
    accessTokenExpiresAt: epochToIso(exp),
  });
}

function authLogout(request: Request) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.append("Set-Cookie", clearAuthCookie(request));
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

/* ================= clipboard ================= */

async function listClipboard(request: Request, env: Env) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const take = Math.min(48, Math.max(1, Number(url.searchParams.get("take") || 24)));
  const cursorId = url.searchParams.get("cursorId");
  const cursorSortWeight = url.searchParams.get("cursorSortWeight");
  const cursorCreatedAtRaw = url.searchParams.get("cursorCreatedAt");

  let cursorCreatedAt: number | null = null;
  if (cursorCreatedAtRaw) {
    if (/^\d+$/.test(cursorCreatedAtRaw)) cursorCreatedAt = Number(cursorCreatedAtRaw);
    else {
      const ms = Date.parse(cursorCreatedAtRaw);
      if (!Number.isNaN(ms)) cursorCreatedAt = Math.floor(ms / 1000);
    }
  }

  const where: string[] = [];
  const binds: unknown[] = [];
  if (search) {
    where.push("(content LIKE ? OR fileName LIKE ?)");
    const like = `%${search}%`;
    binds.push(like, like);
  }
  if (cursorCreatedAt != null && cursorId) {
    if (cursorSortWeight != null && cursorSortWeight !== "") {
      const cs = Number(cursorSortWeight);
      where.push(
        "(sortWeight < ? OR (sortWeight = ? AND (createdAt < ? OR (createdAt = ? AND id < ?))))",
      );
      binds.push(cs, cs, cursorCreatedAt, cursorCreatedAt, cursorId);
    } else {
      where.push("(createdAt < ? OR (createdAt = ? AND id < ?))");
      binds.push(cursorCreatedAt, cursorCreatedAt, cursorId);
    }
  }

  let sql =
    "SELECT id,type,content,fileName,fileSize,sortWeight,contentType,filePath,createdAt,updatedAt FROM ClipboardItem";
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " ORDER BY sortWeight DESC, createdAt DESC, id DESC LIMIT ?";
  binds.push(take + 1);

  const rows = await env.DB.prepare(sql).bind(...binds).all<ClipboardRow>();
  const list = rows.results || [];
  const hasMore = list.length > take;
  const items = (hasMore ? list.slice(0, take) : list).map(itemJson);
  const nextCursor = hasMore
    ? {
        id: items[items.length - 1].id,
        createdAt: items[items.length - 1].createdAt,
        sortWeight: items[items.length - 1].sortWeight,
      }
    : null;
  return json({ items, nextCursor, hasMore });
}

async function getClipboard(_request: Request, env: Env, id: string) {
  const row = await env.DB.prepare(
    "SELECT id,type,content,fileName,fileSize,sortWeight,contentType,filePath,createdAt,updatedAt FROM ClipboardItem WHERE id = ?",
  )
    .bind(id)
    .first<ClipboardRow>();
  if (!row) return json({ error: "Not found" }, 404);
  return json(itemJson(row));
}

async function createClipboard(request: Request, env: Env) {
  const contentType = request.headers.get("Content-Type") || "";
  let content: string | null = null;
  let inType: ItemType | null = null;
  let fileName: string | null = null;
  let fileContentType: string | null = null;
  let fileSize: number | null = null;
  let fileBytes: Uint8Array | null = null;
  let shareExpiresIn: number | null = null;
  let shareMaxDownloads: number | null = null;
  let sharePassword: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File) {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf.byteLength > maxFileSize(env)) {
        return json({ error: `File too large. Max ${maxFileSize(env)} bytes` }, 413);
      }
      fileBytes = buf;
      fileName = file.name || "upload.bin";
      fileContentType = file.type || "application/octet-stream";
      fileSize = buf.byteLength;
      inType = (file.type || "").startsWith("image/") ? "IMAGE" : "FILE";
    }
    const c = form.get("content");
    if (typeof c === "string" && c.length) content = c;
    const t = form.get("type");
    if (typeof t === "string" && t) inType = t.toUpperCase() as ItemType;
    const se = form.get("shareExpiresIn");
    if (typeof se === "string" && se !== "") shareExpiresIn = Math.max(0, Number(se));
    const sm = form.get("shareMaxDownloads");
    if (typeof sm === "string" && sm !== "") shareMaxDownloads = Number(sm);
    const sp = form.get("sharePassword");
    if (typeof sp === "string" && sp.trim()) sharePassword = sp;
  } else {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    if (typeof body.content === "string") content = body.content;
    if (typeof body.type === "string") inType = body.type.toUpperCase() as ItemType;
    if (typeof body.fileName === "string") fileName = body.fileName;
    if (typeof body.contentType === "string") fileContentType = body.contentType;
    if (typeof body.shareExpiresIn === "number") shareExpiresIn = body.shareExpiresIn;
    if (typeof body.shareMaxDownloads === "number") shareMaxDownloads = body.shareMaxDownloads;
    if (typeof body.sharePassword === "string" && body.sharePassword.trim())
      sharePassword = body.sharePassword;
    if (typeof body.fileBase64 === "string" && body.fileBase64) {
      const bin = Uint8Array.from(atob(body.fileBase64), (c) => c.charCodeAt(0));
      if (bin.byteLength > maxFileSize(env)) {
        return json({ error: `File too large. Max ${maxFileSize(env)} bytes` }, 413);
      }
      fileBytes = bin;
      fileSize = bin.byteLength;
      if (!inType) inType = (fileContentType || "").startsWith("image/") ? "IMAGE" : "FILE";
    }
  }

  if (!content && !fileBytes) return json({ error: "Content or file is required" }, 400);

  let filePath: string | null = null;
  if (fileBytes) {
    if (!env.FILES) {
      return json(
        {
          error:
            "File storage (R2) is not configured. Create and bind an R2 bucket as FILES, or use text only.",
        },
        500,
      );
    }
    const ext = fileName && fileName.includes(".") ? fileName.split(".").pop() : "";
    const key = `uploads/${randomUuid()}${ext ? `.${ext}` : ""}`;
    await env.FILES.put(key, fileBytes, {
      httpMetadata: { contentType: fileContentType || "application/octet-stream" },
      customMetadata: { fileName: fileName || "file" },
    });
    filePath = key;
  }

  const type: ItemType =
    inType ||
    (fileBytes ? ((fileContentType || "").startsWith("image/") ? "IMAGE" : "FILE") : "TEXT");

  const id = randomUuid();
  const ts = nowUnix();
  const maxSort =
    (
      await env.DB.prepare("SELECT COALESCE(MAX(sortWeight), 0) as m FROM ClipboardItem").first<{
        m: number;
      }>()
    )?.m || 0;
  const sortWeight = maxSort + 1;

  await env.DB.prepare(
    `INSERT INTO ClipboardItem
      (id, type, content, fileName, fileSize, sortWeight, contentType, filePath, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, type, content, fileName, fileSize, sortWeight, fileContentType, filePath, ts, ts)
    .run();

  // Always create a share link (matches original backend behavior)
  const token = randomToken(18);
  const expiresAt =
    shareExpiresIn != null && shareExpiresIn > 0 ? ts + shareExpiresIn : null;
  const passwordHash = sharePassword ? await sharePasswordHash(sharePassword, token) : null;
  await env.DB.prepare(
    `INSERT INTO ShareLink
      (token, itemId, expiresAt, maxDownloads, downloadCount, revoked, passwordHash, passwordPlain, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
  )
    .bind(token, id, expiresAt, shareMaxDownloads, passwordHash, sharePassword, ts, ts)
    .run();

  // Original create response is the item object with nested share
  return json({
    id,
    type,
    content,
    fileName,
    fileSize,
    sortWeight,
    contentType: fileContentType,
    createdAt: epochToIso(ts),
    updatedAt: epochToIso(ts),
    share: {
      token,
      url: `/s/?token=${token}`,
      expiresAt: expiresAt == null ? null : epochToIso(expiresAt),
      maxDownloads: shareMaxDownloads,
      requiresPassword: !!sharePassword,
      downloadCount: 0,
    },
  });
}

async function reorderClipboard(request: Request, env: Env) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (!ids.length) return json({ ok: true });

  const maxSort =
    (
      await env.DB.prepare("SELECT COALESCE(MAX(sortWeight), 0) as m FROM ClipboardItem").first<{
        m: number;
      }>()
    )?.m || 0;
  const base = maxSort + ids.length;
  const ts = nowUnix();
  const stmts = ids.map((id, i) =>
    env.DB.prepare("UPDATE ClipboardItem SET sortWeight = ?, updatedAt = ? WHERE id = ?").bind(
      base - i,
      ts,
      id,
    ),
  );
  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function deleteClipboard(_request: Request, env: Env, id: string) {
  const existing = await env.DB.prepare("SELECT filePath FROM ClipboardItem WHERE id = ?")
    .bind(id)
    .first<{ filePath: string | null }>();
  await env.DB.prepare("DELETE FROM ShareLink WHERE itemId = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM ClipboardItem WHERE id = ?").bind(id).run();
  if (existing?.filePath && env.FILES) {
    try {
      await env.FILES.delete(existing.filePath);
    } catch {}
  }
  return json({ ok: true });
}

async function getFile(request: Request, env: Env, id: string) {
  const url = new URL(request.url);
  const asDownload = ["1", "true", "yes"].includes(
    (url.searchParams.get("download") || "").toLowerCase(),
  );
  const row = await env.DB.prepare(
    "SELECT filePath, fileName, contentType FROM ClipboardItem WHERE id = ?",
  )
    .bind(id)
    .first<{ filePath: string | null; fileName: string | null; contentType: string | null }>();
  if (!row?.filePath || !env.FILES) return json({ error: "Not found" }, 404);
  const obj = await env.FILES.get(row.filePath);
  if (!obj) return json({ error: "Not found" }, 404);

  const headers = new Headers();
  headers.set("Content-Type", row.contentType || obj.httpMetadata?.contentType || "application/octet-stream");
  const name = row.fileName || "download";
  headers.set(
    "Content-Disposition",
    `${asDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (obj.size != null) headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

/* ================= share ================= */

async function getLatestShare(env: Env, itemId: string) {
  return env.DB.prepare(
    `SELECT token,itemId,expiresAt,maxDownloads,downloadCount,revoked,passwordHash,passwordPlain,createdAt,updatedAt
     FROM ShareLink WHERE itemId = ? ORDER BY createdAt DESC LIMIT 1`,
  )
    .bind(itemId)
    .first<ShareRow>();
}

async function getShareByToken(env: Env, token: string) {
  return env.DB.prepare(
    `SELECT token,itemId,expiresAt,maxDownloads,downloadCount,revoked,passwordHash,passwordPlain,createdAt,updatedAt
     FROM ShareLink WHERE token = ? LIMIT 1`,
  )
    .bind(token)
    .first<ShareRow>();
}

function shareIsInvalid(share: ShareRow | null, now = nowUnix()) {
  if (!share) return "not_found";
  if (share.revoked) return "revoked";
  if (share.expiresAt != null && share.expiresAt < now) return "expired";
  if (share.maxDownloads != null && share.maxDownloads >= 0 && share.downloadCount >= share.maxDownloads)
    return "limit";
  return null;
}

async function ensureShareForItem(env: Env, itemId: string) {
  const now = nowUnix();
  const latest = await getLatestShare(env, itemId);
  const invalid =
    !latest ||
    latest.revoked !== 0 ||
    (latest.expiresAt != null && latest.expiresAt < now) ||
    (latest.maxDownloads != null &&
      latest.maxDownloads >= 0 &&
      latest.downloadCount >= latest.maxDownloads);

  if (!invalid && latest) return latest;

  const token = randomToken(18);
  await env.DB.prepare(
    `INSERT INTO ShareLink
      (token,itemId,expiresAt,maxDownloads,downloadCount,revoked,passwordHash,passwordPlain,createdAt,updatedAt)
     VALUES (?, ?, NULL, NULL, 0, 0, NULL, NULL, ?, ?)`,
  )
    .bind(token, itemId, now, now)
    .run();
  return (await getShareByToken(env, token))!;
}

async function getItemShare(_request: Request, env: Env, itemId: string) {
  const item = await env.DB.prepare("SELECT id FROM ClipboardItem WHERE id = ?")
    .bind(itemId)
    .first();
  if (!item) return json({ error: "Not found" }, 404);
  const share = await ensureShareForItem(env, itemId);
  return json({
    token: share.token,
    url: `/s/?token=${share.token}`,
    expiresAt: share.expiresAt == null ? null : epochToIso(share.expiresAt),
    maxDownloads: share.maxDownloads,
    downloadCount: share.downloadCount,
    requiresPassword: !!share.passwordHash,
    password: share.passwordPlain,
  });
}

async function updateItemShare(request: Request, env: Env, itemId: string) {
  const item = await env.DB.prepare("SELECT id FROM ClipboardItem WHERE id = ?")
    .bind(itemId)
    .first();
  if (!item) return json({ error: "Not found" }, 404);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const now = nowUnix();

  if (body.disable === true) {
    await env.DB.prepare("UPDATE ShareLink SET revoked = 1, updatedAt = ? WHERE itemId = ? AND revoked = 0")
      .bind(now, itemId)
      .run();
    return json({ ok: true });
  }

  let current = await getLatestShare(env, itemId);
  if (!current) {
    current = await ensureShareForItem(env, itemId);
  }

  let token = current.token;
  const expiresAbs =
    body.expiresIn != null
      ? Number(body.expiresIn) > 0
        ? now + Number(body.expiresIn)
        : null
      : current.expiresAt;
  const max =
    body.maxDownloads !== undefined && body.maxDownloads !== null
      ? Number(body.maxDownloads)
      : current.maxDownloads;

  if (body.reset === true) {
    const newToken = randomToken(18);
    let newHash: string | null = null;
    let newPlain: string | null = null;
    if (typeof body.password === "string" && body.password.trim()) {
      newPlain = body.password;
      newHash = await sharePasswordHash(body.password, newToken);
    }
    await env.DB.prepare(
      `UPDATE ShareLink SET token=?, expiresAt=?, maxDownloads=?, passwordHash=?, passwordPlain=?, updatedAt=? WHERE token=?`,
    )
      .bind(newToken, expiresAbs, max, newHash, newPlain, now, token)
      .run();
    token = newToken;
  } else if (body.password !== undefined || body.expiresIn !== undefined || body.maxDownloads !== undefined) {
    let hash = current.passwordHash;
    let plain = current.passwordPlain;
    if (body.password !== undefined) {
      if (typeof body.password === "string" && body.password.trim()) {
        plain = body.password;
        hash = await sharePasswordHash(body.password, token);
      } else {
        plain = null;
        hash = null;
      }
    }
    await env.DB.prepare(
      `UPDATE ShareLink SET expiresAt=?, maxDownloads=?, passwordHash=?, passwordPlain=?, updatedAt=? WHERE token=?`,
    )
      .bind(expiresAbs, max, hash, plain, now, token)
      .run();
  }

  const share = await getShareByToken(env, token);
  return json({
    token: share!.token,
    url: `/s/?token=${share!.token}`,
    expiresAt: share!.expiresAt == null ? null : epochToIso(share!.expiresAt),
    maxDownloads: share!.maxDownloads,
    downloadCount: share!.downloadCount,
    requiresPassword: !!share!.passwordHash,
    password: share!.passwordPlain,
  });
}

async function checkSharePassword(request: Request, share: ShareRow) {
  if (!share.passwordHash) return true;
  const cookies = parseCookies(request.headers.get("Cookie"));
  const cookieKey = `share_auth_${share.token}`;
  if (cookies[cookieKey] && timingSafeEqual(cookies[cookieKey], share.passwordHash)) return true;

  const header = request.headers.get("X-Share-Password") || "";
  if (header) {
    const h = await sharePasswordHash(header, share.token);
    if (timingSafeEqual(h, share.passwordHash)) return true;
  }
  const q = new URL(request.url).searchParams.get("password") || "";
  if (q) {
    const h = await sharePasswordHash(q, share.token);
    if (timingSafeEqual(h, share.passwordHash)) return true;
  }
  return false;
}

async function shareMeta(request: Request, env: Env, token: string) {
  const share = await getShareByToken(env, token);
  const invalid = shareIsInvalid(share);
  if (!share || invalid === "not_found") return json({ error: "Not found" }, 404);
  if (invalid) {
    return json({ error: invalid, requiresPassword: !!share.passwordHash }, 410);
  }

  const needsPassword = !!share.passwordHash;
  if (needsPassword && !(await checkSharePassword(request, share))) {
    return json({
      token: share.token,
      requiresPassword: true,
      authorized: false,
      item: null,
      expiresAt: share.expiresAt == null ? null : epochToIso(share.expiresAt),
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
    });
  }

  // Count visit like original (optional; keep for downloadCount semantics on meta)
  await env.DB.prepare("UPDATE ShareLink SET downloadCount = downloadCount + 1, updatedAt = ? WHERE token = ?")
    .bind(nowUnix(), token)
    .run();

  const item = await env.DB.prepare(
    "SELECT id,type,content,fileName,fileSize,sortWeight,contentType,filePath,createdAt,updatedAt FROM ClipboardItem WHERE id = ?",
  )
    .bind(share.itemId)
    .first<ClipboardRow>();
  if (!item) return json({ error: "Item missing" }, 404);

  return json({
    token: share.token,
    requiresPassword: needsPassword,
    authorized: true,
    hasPassword: needsPassword,
    expiresAt: share.expiresAt == null ? null : epochToIso(share.expiresAt),
    maxDownloads: share.maxDownloads,
    downloadCount: share.downloadCount + 1,
    item: itemJson(item),
  });
}

async function shareVerify(request: Request, env: Env, token: string) {
  const share = await getShareByToken(env, token);
  const invalid = shareIsInvalid(share);
  if (!share || invalid === "not_found") return json({ error: "Not found" }, 404);
  if (invalid) return json({ error: invalid }, 410);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (!share.passwordHash) return json({ success: true });
  const password = String(body.password || "");
  const h = await sharePasswordHash(password, token);
  if (!timingSafeEqual(h, share.passwordHash)) return json({ error: "Invalid password" }, 401);

  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.append(
    "Set-Cookie",
    `share_auth_${token}=${share.passwordHash}; Max-Age=604800; Path=/; SameSite=None; Secure; HttpOnly`,
  );
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

async function shareFile(request: Request, env: Env, token: string, asDownload: boolean) {
  const share = await getShareByToken(env, token);
  const invalid = shareIsInvalid(share);
  if (!share || invalid === "not_found") return json({ error: "Not found" }, 404);
  if (invalid) return json({ error: invalid }, 410);
  if (!(await checkSharePassword(request, share))) return json({ error: "Password required" }, 401);

  const item = await env.DB.prepare(
    "SELECT filePath, fileName, contentType, type, content FROM ClipboardItem WHERE id = ?",
  )
    .bind(share.itemId)
    .first<{
      filePath: string | null;
      fileName: string | null;
      contentType: string | null;
      type: string;
      content: string | null;
    }>();

  if (!item) return json({ error: "Not found" }, 404);

  if (asDownload) {
    await env.DB.prepare(
      "UPDATE ShareLink SET downloadCount = downloadCount + 1, updatedAt = ? WHERE token = ?",
    )
      .bind(nowUnix(), token)
      .run();
  }

  if (item.type === "TEXT") {
    const text = item.content || "";
    const headers = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="share.txt"`,
    });
    return new Response(text, { status: 200, headers });
  }

  if (!item.filePath || !env.FILES) return json({ error: "Not found" }, 404);
  const obj = await env.FILES.get(item.filePath);
  if (!obj) return json({ error: "Not found" }, 404);
  const headers = new Headers();
  headers.set("Content-Type", item.contentType || obj.httpMetadata?.contentType || "application/octet-stream");
  const name = item.fileName || "file";
  headers.set(
    "Content-Disposition",
    `${asDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  return new Response(obj.body, { status: 200, headers });
}

async function shareQr(request: Request, env: Env, token: string) {
  // Minimal SVG QR placeholder: return a simple SVG with the share URL text.
  // Frontend mainly uses this endpoint for download/display; a full QR encoder is optional.
  const share = await getShareByToken(env, token);
  if (!share || shareIsInvalid(share)) return json({ error: "Not found" }, 404);
  const origin = new URL(request.url).origin;
  // Prefer frontend origin if provided
  const page = request.headers.get("Referer") || origin;
  let base = origin;
  try {
    base = new URL(page).origin;
  } catch {}
  const url = `${base}/s/?token=${encodeURIComponent(token)}`;
  const size = Math.min(512, Math.max(128, Number(new URL(request.url).searchParams.get("size") || 256)));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="#fff"/>
  <rect x="8" y="8" width="${size - 16}" height="${size - 16}" fill="none" stroke="#111" stroke-width="4"/>
  <text x="50%" y="45%" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#111">Share QR</text>
  <text x="50%" y="58%" text-anchor="middle" font-family="monospace" font-size="10" fill="#333">${escapeXml(url.slice(0, 42))}</text>
</svg>`;
  return new Response(svg, {
    status: 200,
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

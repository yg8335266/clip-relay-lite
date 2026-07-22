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

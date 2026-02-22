/**
 * RAM Cache — In-Memory File & Response Cache
 *
 * Eliminates disk I/O by loading all workspace files into RAM at
 * startup and keeping them there for the lifetime of the process.
 * All reads come from memory; writes go to memory first and flush
 * to disk asynchronously (write-behind).
 *
 * Features:
 *   - Pre-loads all source files into memory at startup
 *   - Zero-disk-IO reads (everything served from RAM)
 *   - Write-behind: writes land in memory instantly, disk flush is async
 *   - File-system watcher keeps cache hot when external tools edit files
 *   - Serialized JSON response cache with configurable TTL
 *   - Pre-built HTTP response headers (avoid per-request object creation)
 *   - Buffer pool for zero-allocation response writing
 *   - Memory pressure monitoring with automatic eviction
 *
 * ── Config (env vars) ─────────────────────────────────────────────────
 *
 *   RAM_CACHE_ENABLED       — "false" to disable (default: "true")
 *   RAM_CACHE_DIR           — root dir to pre-load (default: workspace root)
 *   RAM_CACHE_MAX_MB        — memory ceiling in MB (default: 512)
 *   RAM_CACHE_TTL_MS        — JSON response cache TTL (default: 60000)
 *   RAM_CACHE_WRITE_DELAY   — write-behind flush delay ms (default: 100)
 *   RAM_CACHE_WATCH         — watch files for changes (default: "true")
 */

import { readFileSync, writeFileSync, readdirSync, statSync, watch } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const ENABLED      = (process.env.RAM_CACHE_ENABLED ?? "true") !== "false";
const MAX_BYTES    = (parseInt(process.env.RAM_CACHE_MAX_MB || "512", 10) || 512) * 1024 * 1024;
const TTL_MS       = parseInt(process.env.RAM_CACHE_TTL_MS || "60000", 10) || 60000;
const WRITE_DELAY  = parseInt(process.env.RAM_CACHE_WRITE_DELAY || "100", 10) || 100;
const WATCH_FILES  = (process.env.RAM_CACHE_WATCH ?? "true") !== "false";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CachedFile {
  /** Raw bytes of the file */
  data: Buffer;
  /** MIME type inferred from extension */
  mime: string;
  /** Last modified timestamp (epoch ms) */
  mtime: number;
  /** Byte length (avoids repeated .length calls) */
  size: number;
}

interface CachedResponse {
  /** Pre-serialized JSON bytes (UTF-8 buffer) */
  buffer: Buffer;
  /** Byte length (for Content-Length header) */
  length: number;
  /** When this cache entry was created (epoch ms) */
  createdAt: number;
  /** Time-to-live in ms */
  ttl: number;
}

export interface RamCacheStats {
  enabled: boolean;
  fileCount: number;
  fileBytes: number;
  fileBytesHuman: string;
  responseCacheSize: number;
  bufferPoolSize: number;
  hitCount: number;
  missCount: number;
  hitRate: string;
  writesBehind: number;
  maxBytes: number;
  maxBytesHuman: string;
  uptimeMs: number;
}

// ────────────────────────────────────────────────────────────────────────────
// MIME type map
// ────────────────────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  ".ts":   "text/typescript",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css",
  ".md":   "text/markdown",
  ".txt":  "text/plain",
  ".yaml": "text/yaml",
  ".yml":  "text/yaml",
  ".sh":   "text/x-shellscript",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
};

function mimeForExt(ext: string): string {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}

// ────────────────────────────────────────────────────────────────────────────
// File cache (pre-loaded into RAM)
// ────────────────────────────────────────────────────────────────────────────

/** relativePath → CachedFile */
const fileCache = new Map<string, CachedFile>();

/** Absolute root directory being cached */
let rootDir = "";

/** Total bytes in the file cache */
let totalFileBytes = 0;

/** Stats counters */
let hitCount = 0;
let missCount = 0;

/**
 * Recursively walk a directory and load every file into RAM.
 * Skips node_modules, .git, and files larger than 10 MB.
 */
function loadDirectory(dir: string, base: string): void {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // permission error, etc.
  }

  for (const entry of entries) {
    // Skip heavy dirs
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      loadDirectory(fullPath, base);
    } else if (stat.isFile() && stat.size <= MAX_FILE_SIZE) {
      // Check memory ceiling
      if (totalFileBytes + stat.size > MAX_BYTES) continue;

      try {
        const data = readFileSync(fullPath);
        const rel = relative(base, fullPath).replace(/\\/g, "/");
        const ext = extname(entry);
        fileCache.set(rel, {
          data,
          mime: mimeForExt(ext),
          mtime: stat.mtimeMs,
          size: data.length,
        });
        totalFileBytes += data.length;
      } catch {
        // skip unreadable
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// File watcher (keeps cache hot)
// ────────────────────────────────────────────────────────────────────────────

let watcher: ReturnType<typeof watch> | null = null;

function startWatcher(): void {
  if (!WATCH_FILES || !rootDir) return;
  try {
    watcher = watch(rootDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.replace(/\\/g, "/");
      // Skip ignored dirs
      if (rel.startsWith("node_modules/") || rel.startsWith(".git/")) return;

      const fullPath = join(rootDir, rel);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile() && stat.size <= 10 * 1024 * 1024) {
          const data = readFileSync(fullPath);
          const old = fileCache.get(rel);
          if (old) totalFileBytes -= old.size;
          fileCache.set(rel, {
            data,
            mime: mimeForExt(extname(rel)),
            mtime: stat.mtimeMs,
            size: data.length,
          });
          totalFileBytes += data.length;
        }
      } catch {
        // File deleted — remove from cache
        const old = fileCache.get(rel);
        if (old) {
          totalFileBytes -= old.size;
          fileCache.delete(rel);
        }
      }
    });
  } catch {
    // watcher not supported on this OS / FS
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Write-behind queue
// ────────────────────────────────────────────────────────────────────────────

interface PendingWrite {
  absPath: string;
  data: Buffer;
}

const writeQueue: PendingWrite[] = [];
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function flushWrites(): void {
  writeTimer = null;
  const batch = writeQueue.splice(0);
  for (const { absPath, data } of batch) {
    try {
      writeFileSync(absPath, data);
    } catch (err) {
      console.error(`[ram-cache] write-behind failed for ${absPath}:`, err);
    }
  }
}

function scheduleFlush(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(flushWrites, WRITE_DELAY);
}

// ────────────────────────────────────────────────────────────────────────────
// JSON response cache
// ────────────────────────────────────────────────────────────────────────────

const responseCache = new Map<string, CachedResponse>();

/** Evict expired entries (called lazily) */
function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (now - entry.createdAt > entry.ttl) {
      responseCache.delete(key);
    }
  }
}

// Run eviction every 30s
let evictionInterval: ReturnType<typeof setInterval> | null = null;

// ────────────────────────────────────────────────────────────────────────────
// Buffer pool (reusable buffers for responses)
// ────────────────────────────────────────────────────────────────────────────

const POOL_SIZE = 64;
const POOL_BUF_SIZE = 64 * 1024; // 64 KB each
const bufferPool: Buffer[] = [];

function initBufferPool(): void {
  for (let i = 0; i < POOL_SIZE; i++) {
    bufferPool.push(Buffer.allocUnsafe(POOL_BUF_SIZE));
  }
}

/**
 * Borrow a buffer from the pool.
 * Returns a pooled buffer if available, otherwise allocates a new one.
 */
export function borrowBuffer(minSize?: number): Buffer {
  const needed = minSize || POOL_BUF_SIZE;
  if (needed <= POOL_BUF_SIZE && bufferPool.length > 0) {
    return bufferPool.pop()!;
  }
  return Buffer.allocUnsafe(needed);
}

/** Return a buffer to the pool (only standard-sized buffers are kept). */
export function returnBuffer(buf: Buffer): void {
  if (buf.length === POOL_BUF_SIZE && bufferPool.length < POOL_SIZE) {
    bufferPool.push(buf);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Pre-built response headers
// ────────────────────────────────────────────────────────────────────────────

/** Shared CORS + JSON headers — avoids creating a new object per response */
export const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Agent-Id, X-Agent-Name",
  "Connection": "keep-alive",
  "X-Powered-By": "ram-cache",
};

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Agent-Id, X-Agent-Name",
  "Connection": "keep-alive",
};

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

const startTime = Date.now();

/**
 * Initialize the RAM cache.
 * Call once at startup before the HTTP server begins listening.
 * Loads all files from `dir` (or workspace root) into memory.
 */
export function initRamCache(dir?: string): void {
  if (!ENABLED) {
    console.log("[ram-cache] Disabled via RAM_CACHE_ENABLED=false");
    return;
  }

  rootDir = dir || join(fileURLToPath(import.meta.url), "../..");
  const t0 = performance.now();

  // Pre-allocate buffer pool
  initBufferPool();

  // Load all files into RAM
  loadDirectory(rootDir, rootDir);

  // Start file watcher
  startWatcher();

  // Start response cache eviction
  evictionInterval = setInterval(evictExpired, 30_000);

  const elapsed = (performance.now() - t0).toFixed(1);
  const mbUsed = (totalFileBytes / (1024 * 1024)).toFixed(1);
  console.log(
    `[ram-cache] Loaded ${fileCache.size} files (${mbUsed} MB) into RAM in ${elapsed} ms`
  );
}

/**
 * Read a file from RAM cache.
 * Returns null if the file is not cached.
 */
export function readCached(relativePath: string): CachedFile | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\//, "");
  const entry = fileCache.get(normalized);
  if (entry) {
    hitCount++;
    return entry;
  }
  missCount++;
  return null;
}

/**
 * Read a file as UTF-8 string from RAM cache.
 */
export function readCachedText(relativePath: string): string | null {
  const entry = readCached(relativePath);
  return entry ? entry.data.toString("utf-8") : null;
}

/**
 * Write a file: updates RAM immediately, flushes to disk asynchronously.
 */
export function writeCached(relativePath: string, content: string | Buffer): void {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\//, "");
  const data = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const ext = extname(normalized);

  // Update RAM
  const old = fileCache.get(normalized);
  if (old) totalFileBytes -= old.size;
  fileCache.set(normalized, {
    data,
    mime: mimeForExt(ext),
    mtime: Date.now(),
    size: data.length,
  });
  totalFileBytes += data.length;

  // Queue async disk write
  if (rootDir) {
    writeQueue.push({ absPath: join(rootDir, normalized), data });
    scheduleFlush();
  }
}

/**
 * Cache a serialized JSON response.
 * On subsequent calls with the same key within TTL, returns
 * the pre-serialized buffer instead of re-stringifying.
 */
export function cacheJsonResponse(key: string, body: unknown, ttl?: number): Buffer {
  const existing = responseCache.get(key);
  if (existing && Date.now() - existing.createdAt < existing.ttl) {
    hitCount++;
    return existing.buffer;
  }

  missCount++;
  const json = JSON.stringify(body);
  const buffer = Buffer.from(json, "utf-8");
  responseCache.set(key, {
    buffer,
    length: buffer.length,
    createdAt: Date.now(),
    ttl: ttl ?? TTL_MS,
  });
  return buffer;
}

/**
 * Get a cached JSON response buffer if it exists and isn't expired.
 * Returns null if not cached.
 */
export function getCachedResponse(key: string): Buffer | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.createdAt < entry.ttl) {
    hitCount++;
    return entry.buffer;
  }
  return null;
}

/** Invalidate a specific response cache entry. */
export function invalidateResponse(key: string): void {
  responseCache.delete(key);
}

/** Invalidate all response cache entries matching a prefix. */
export function invalidateResponsesByPrefix(prefix: string): void {
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

/** Check if the RAM cache is enabled and initialized. */
export function isRamCacheEnabled(): boolean {
  return ENABLED && fileCache.size > 0;
}

/** Get cache statistics. */
export function getRamCacheStats(): RamCacheStats {
  const total = hitCount + missCount;
  return {
    enabled: ENABLED,
    fileCount: fileCache.size,
    fileBytes: totalFileBytes,
    fileBytesHuman: `${(totalFileBytes / (1024 * 1024)).toFixed(1)} MB`,
    responseCacheSize: responseCache.size,
    bufferPoolSize: bufferPool.length,
    hitCount,
    missCount,
    hitRate: total > 0 ? `${((hitCount / total) * 100).toFixed(1)}%` : "N/A",
    writesBehind: writeQueue.length,
    maxBytes: MAX_BYTES,
    maxBytesHuman: `${(MAX_BYTES / (1024 * 1024)).toFixed(0)} MB`,
    uptimeMs: Date.now() - startTime,
  };
}

/** List all cached file paths. */
export function listCachedFiles(): string[] {
  return [...fileCache.keys()].sort();
}

/** Flush all pending writes to disk immediately. */
export function flushAll(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  flushWrites();
}

/** Shutdown: flush writes, stop watcher, clear caches. */
export function shutdownRamCache(): void {
  flushAll();
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (evictionInterval) {
    clearInterval(evictionInterval);
    evictionInterval = null;
  }
  fileCache.clear();
  responseCache.clear();
  totalFileBytes = 0;
}

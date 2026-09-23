import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "../../../content/adventures/wizard-art.json";
import { createQaSession, qaAccessConfig, qaCookieName } from "../../lib/qa-access";
import { sha256Bytes } from "./fixed-sprite";
import { env } from "../../lib/env";

const MAX_BYTES = 20 * 1024 * 1024;
const cache = new Map<string, Buffer>(); // Child-free only, at most two verified files.
export function collectionArtOrigin(): string {
  const url = new URL(env().APP_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw Error("COLLECTION_ART: a trusted HTTPS APP_URL origin is required");
  }
  return url.origin;
}

/** Read the exact published pixels, never a model URL or a request-supplied host.
 * Local verification reads disk. Deployed servers read their own static CDN:
 * bundling another 110MB into every function would exceed the platform limit.
 * Redirects, unlisted paths, wrong hashes, oversized bodies and login HTML fail
 * before any paid rendering. No credentials or image bytes are logged. */
export async function readCollectionArt(art: string, expectedHash: string, root = process.cwd(),
  remote?: { fetch: typeof fetch; cookie: string }): Promise<Buffer | null> {
  const entry = manifest.find(row => row.path === art);
  if (!entry) return null;
  if (entry.sha256 !== expectedHash || !/^public\/scenes\/adventure-[a-z0-9-]+\/base\.webp$/.test(art)) throw Error("COLLECTION_ART: unexpected pinned artwork");
  if (!remote) {
    try {
      const bytes = await readFile(path.join(root, art));
      if (bytes.length > MAX_BYTES || sha256Bytes(bytes) !== entry.sha256) throw Error("COLLECTION_ART: local pixels changed");
      return bytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const config = qaAccessConfig();
    if (process.env.VERCEL !== "1") throw Error("COLLECTION_ART: packaged pixels missing outside deployment");
    if (cache.has(entry.sha256)) return cache.get(entry.sha256)!;
    remote = { fetch: globalThis.fetch, cookie: config.enabled ? `${qaCookieName(config)}=${await createQaSession(config)}` : "" };
  }
  const origin = collectionArtOrigin();
  const response = await remote.fetch(`${origin}/${art.slice(7)}`, {
    method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
    headers: { ...(remote.cookie ? { cookie: remote.cookie } : {}), accept: "image/webp" },
  });
  if (!response.ok || !/^image\/webp\b/i.test(response.headers.get("content-type") ?? "") || !response.body
    || Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw Error(`COLLECTION_ART: static image unavailable at ${origin}; verify promoted release`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw Error("COLLECTION_ART: image exceeds byte bound"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (sha256Bytes(bytes) !== entry.sha256) throw Error(`COLLECTION_ART: published pixels changed at ${origin}; verify promoted release`);
  cache.set(entry.sha256, bytes);
  while (cache.size > 2) cache.delete(cache.keys().next().value!);
  return bytes;
}

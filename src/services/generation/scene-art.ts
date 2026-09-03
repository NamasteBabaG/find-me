import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The base art of a world.
 *
 * Worlds are rendered once and live in `public/`, so a dev box reads them off
 * disk. A serverless host serves them from its CDN and may not have them in the
 * function bundle, so we fall back to fetching them from our own origin. Either
 * way an art file is immutable for the life of a scene version, so one copy per
 * process is enough — nine worlds is ~18MB, and a run touches only the ones it
 * generates for.
 */
const cache = new Map<string, Buffer>();

export async function loadSceneArt(appUrl: string, relativePath: string): Promise<Buffer> {
  const key = relativePath;
  const hit = cache.get(key);
  if (hit) return hit;
  const buffer = (await fromDisk(relativePath)) ?? (await fromOrigin(appUrl, relativePath));
  cache.set(key, buffer);
  return buffer;
}

async function fromDisk(relativePath: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", relativePath.replace(/^\//, "")));
  } catch {
    return null;
  }
}

async function fromOrigin(appUrl: string, relativePath: string): Promise<Buffer> {
  const url = new URL(relativePath, appUrl).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`scene art not found: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Tests and long-running scripts that swap art between runs. */
export function clearSceneArtCache(): void {
  cache.clear();
}

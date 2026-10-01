import type { PassportPageView, PassportView } from "@/domain/passport/passport";

type Entry = { image: HTMLImageElement; ready: boolean; pending: Promise<boolean> };
// Decoded images are kept only in this page session; authentication stays on
// the existing media endpoints. Bound memory and never warm the whole album.
const images = new Map<string, Entry>();
const MAX_IMAGES = 32;

export function passportImageReady(src: string): boolean { return images.get(src)?.ready ?? false; }

export function warmPassportImage(src: string): Promise<boolean> {
  if (typeof window === "undefined" || !/^(\/[^/]|https?:\/\/)/.test(src)) return Promise.resolve(false);
  try { if (new URL(src, window.location.href).origin !== window.location.origin) return Promise.resolve(false); }
  catch { return Promise.resolve(false); }
  const cached = images.get(src);
  if (cached) return cached.pending;
  const image = new window.Image();
  image.decoding = "async";
  let resolve!: (ready: boolean) => void;
  const pending = new Promise<boolean>(done => { resolve = done; });
  const entry: Entry = { image, pending, ready: false };
  let settled = false;
  images.set(src, entry);
  while (images.size > MAX_IMAGES) images.delete(images.keys().next().value!);
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer); image.onload = null; image.onerror = null;
    entry.ready = ready;
    if (!ready && images.get(src) === entry) images.delete(src);
    resolve(ready);
  };
  const timer = setTimeout(() => finish(false), 15_000);
  image.onload = () => {
    if (image.decode) void image.decode().then(() => finish(true), () => finish(true));
    else finish(true);
  };
  image.onerror = () => finish(false);
  image.src = src;
  return pending;
}

export function spreadImageUrls(page: PassportPageView): string[] {
  return [page.photoUrl, ...page.discoveries.filter(d => d.collected).map(d => d.imageUrl)].filter((src): src is string => !!src);
}

/** The saved spread and its neighbour, including when the map prepares the owner's book. */
export function warmPassportBook(book: PassportView, cursorKey?: string, pageId?: string): void {
  let pages = book.worlds[0]?.pages ?? [];
  let index = 0;
  if (pageId) {
    pages = book.worlds.find(w => w.pages.some(p => p.id === pageId))?.pages ?? pages;
    index = Math.max(0, pages.findIndex(p => p.id === pageId));
  } else if (cursorKey && typeof window !== "undefined") {
    try {
      const cursor = JSON.parse(sessionStorage.getItem(`passport-cursor:${cursorKey}`) ?? "null");
      const world = book.worlds.find(w => w.id === cursor?.world && w.pages.some(p => p.id === cursor?.page));
      if (world) { pages = world.pages; index = pages.findIndex(p => p.id === cursor.page); }
    } catch { /* A corrupt cursor is only a navigation convenience. */ }
  }
  const neighbour = pages[index + 1] ?? pages[index - 1];
  const urls = [book.avatarUrl, ...[pages[index], neighbour].flatMap(p => p ? spreadImageUrls(p) : [])];
  for (const src of new Set(urls)) if (src) void warmPassportImage(src);
}

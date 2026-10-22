/** Page-local browser images only; authorization remains on each image URL. */
export interface ImagePreload {
  image: HTMLImageElement;
  ready: Promise<boolean>;
  cancel: () => void;
}

export function preloadGameImage(url: string, priority: "high" | "low" = "low"): ImagePreload {
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = priority;
  let resolve!: (ready: boolean) => void;
  const ready = new Promise<boolean>(done => { resolve = done; });
  let finished = false;
  const finish = (ok: boolean) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    image.onload = null; image.onerror = null;
    resolve(ok);
  };
  const cancel = () => { finish(false); image.removeAttribute("src"); };
  const timer = setTimeout(cancel, 20_000);
  image.onload = () => {
    if (typeof image.decode !== "function") { finish(true); return; }
    void image.decode().then(() => finish(true), () => finish(false));
  };
  image.onerror = () => finish(false);
  image.src = url;
  return { image, ready, cancel };
}

/** A map/gift prepares at most one board and its first hide, never a whole world. */
export function warmGameImages(urls: readonly string[]): { ready: Promise<boolean[]>; cancel: () => void } {
  const selected = [...new Set(urls)].filter(url => /^\/[^/]/.test(url)).slice(0, 2);
  const loads = selected.map(url => preloadGameImage(url));
  return { ready: Promise.all(loads.map(load => load.ready)), cancel: () => loads.forEach(load => load.cancel()) };
}

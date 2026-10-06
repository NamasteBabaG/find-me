import type { PassportView } from "@/domain/passport/passport";
import { warmPassportBook } from "@/ui/passport/image-preload";

export type RemoteBook = { book: PassportView; childId: string };

/** Page-session cache only. The owner endpoint still authorizes every refresh.
 * Keep prefetch separate from the reader so maps do not load passport UI. */
const remoteBooks = new Map<string, { at: number; value: RemoteBook | null; pending: Promise<RemoteBook> | null }>();

export function cachedOwnerPassport(gameId: string): RemoteBook | null {
  return remoteBooks.get(gameId)?.value ?? null;
}

export function prefetchOwnerPassport(gameId: string, maxAgeMs = 30_000): Promise<RemoteBook> {
  const entry = remoteBooks.get(gameId);
  if (entry?.pending) return entry.pending;
  if (entry?.value && Date.now() - entry.at < maxAgeMs) {
    warmPassportBook(entry.value.book, entry.value.childId);
    return Promise.resolve(entry.value);
  }
  const pending = fetch(`/api/passport?gameId=${encodeURIComponent(gameId)}`, { cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw new Error("passport-unavailable");
      const data = await response.json();
      const value: RemoteBook = { book: data.book, childId: data.childId };
      remoteBooks.set(gameId, { at: Date.now(), value, pending: null });
      warmPassportBook(value.book, value.childId);
      return value;
    })
    .catch(error => {
      remoteBooks.set(gameId, { at: entry?.at ?? 0, value: entry?.value ?? null, pending: null });
      throw error;
    });
  remoteBooks.set(gameId, { at: entry?.at ?? 0, value: entry?.value ?? null, pending });
  return pending;
}

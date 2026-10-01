"use client";
import { useEffect, useState } from "react";
import type { PassportView } from "@/domain/passport/passport";
import { PassportBook } from "./PassportBook";

export function OwnerPassport({ initial, childId, onPlayHere }: {
  initial: PassportView;
  childId: string;
  /** Inside a game: open one of this game's places without leaving it. Returns false for another game's place. */
  onPlayHere?: (gameId: string, board: string) => boolean;
}) {
  const [book, setBook] = useState(initial);
  // A fresher book from the game (a new stamp) replaces this one in place; the open page stays open.
  useEffect(() => setBook(initial), [initial]);
  // "Back to this place" stays inside the game when it can; another game's place keeps its link.
  const play = onPlayHere ? (pageId: string) => {
    const at = pageId.indexOf(":");
    if (at > 0 && onPlayHere(pageId.slice(0, at), pageId.slice(at + 1))) return;
    const href = book.worlds.flatMap(world => world.pages).find(page => page.id === pageId)?.playHref;
    if (href) window.location.assign(href);
  } : undefined;
  async function choose(pageId: string, targetId: string) {
    const [gameId, board] = pageId.split(":");
    const response = await fetch("/api/passport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId, gameId, board, choice: { kind: "photo", targetId } }) });
    if (!response.ok) throw new Error("not-saved");
    const refreshed = await fetch(`/api/passport?childId=${encodeURIComponent(childId)}`, { cache: "no-store" });
    if (!refreshed.ok) throw new Error("not-refreshed");
    const data = await refreshed.json();
    setBook(data.book);
  }
  return <PassportBook book={book} onPhotoSelect={choose} onPlay={play} cursorKey={childId} />;
}

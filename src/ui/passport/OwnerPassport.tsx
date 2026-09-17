"use client";
import { useState } from "react";
import type { PassportView } from "@/domain/passport/passport";
import { PassportBook } from "./PassportBook";

export function OwnerPassport({ initial, childId }: { initial: PassportView; childId: string }) {
  const [book, setBook] = useState(initial);
  async function choose(pageId: string, targetId: string) {
    const [gameId, board] = pageId.split(":");
    const response = await fetch("/api/passport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId, gameId, board, choice: { kind: "photo", targetId } }) });
    if (!response.ok) throw new Error("not-saved");
    const refreshed = await fetch(`/api/passport?childId=${encodeURIComponent(childId)}`, { cache: "no-store" });
    if (!refreshed.ok) throw new Error("not-refreshed");
    const data = await refreshed.json();
    setBook(data.book);
  }
  return <PassportBook book={book} onPhotoSelect={choose} cursorKey={childId} />;
}

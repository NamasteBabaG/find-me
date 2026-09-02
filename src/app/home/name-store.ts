"use client";

import { create } from "zustand";

/**
 * The landing page lets a parent type their child's name once and watches
 * the whole page personalise itself (headline, CTA, final call). Nothing
 * is stored server-side; the name travels to /create as a query param.
 */
interface NameState {
  raw: string;
  setRaw: (v: string) => void;
}

export const useNameStore = create<NameState>((set) => ({
  raw: "",
  setRaw: (raw) => set({ raw: raw.slice(0, 16) }),
}));

export function displayName(raw: string, fallback: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  return t.length >= 2 ? t : fallback;
}

export function createHref(raw: string): string {
  const t = raw.trim();
  return t.length >= 2 ? `/create?name=${encodeURIComponent(t)}` : "/create";
}

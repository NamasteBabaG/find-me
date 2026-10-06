import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ game: vi.fn(), user: vi.fn(), token: null as string | null, admin: false }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.game } } }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: async () => f.token, isAdminEmail: () => f.admin }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); }, redirect: (href: string) => { throw Error(`REDIRECT:${href}`); } }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: { create: { photo: { title: "Synthetic {name}" }, creating: { needsNewPhoto: "Synthetic {name}" } } } }) }));
vi.mock("@/ui/Shell", () => ({ SiteHeader: () => null }));
vi.mock("@/app/create/photo/PhotoUploader", () => ({ PhotoUploader: () => null }));
vi.mock("../[gameId]/CreatingStatus", () => ({ CreatingStatus: () => null }));

import CreatingPage from "../[gameId]/page";
import NewPhotoPage from "../[gameId]/photo/page";

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React); f.token = null; f.admin = false; f.user.mockResolvedValue(null);
  f.game.mockResolvedValue({ ownerId: "owner", draftToken: "synthetic-draft", status: "NEEDS_NEW_PHOTO", configJson: null, childProfile: { displayName: "Synthetic" }, owner: null });
});
afterEach(() => vi.unstubAllGlobals());

describe.each([{ name: "creating", page: CreatingPage }, { name: "replacement photo", page: NewPhotoPage }])("$name page authorization", ({ page }) => {
  it.each(["cookie", "owner", "admin"])("allows %s authority", async authority => {
    f.token = authority === "cookie" ? "synthetic-draft" : "foreign-draft";
    f.user.mockResolvedValue(authority === "owner" ? { id: "owner" } : authority === "admin" ? { id: "admin" } : null);
    f.admin = authority === "admin";
    expect(await page({ params: Promise.resolve({ gameId: "synthetic" }) })).toBeTruthy();
  });

  it.each(["anonymous", "foreign-owner", "participant"])("hides private content from %s with the same 404 behavior", async authority => {
    f.token = "foreign-draft"; f.user.mockResolvedValue(authority === "anonymous" ? null : { id: authority });
    await expect(page({ params: Promise.resolve({ gameId: "synthetic" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("still hides a missing game", async () => {
    f.game.mockResolvedValue(null);
    await expect(page({ params: Promise.resolve({ gameId: "synthetic" }) })).rejects.toThrow("NOT_FOUND");
  });
});

it("an authorized photo page still redirects away when the paid game is not awaiting a new photo", async () => {
  f.user.mockResolvedValue({ id: "owner" });
  f.game.mockResolvedValue({ ownerId: "owner", draftToken: null, status: "READY", childProfile: { displayName: "Synthetic" } });
  await expect(NewPhotoPage({ params: Promise.resolve({ gameId: "synthetic" }) })).rejects.toThrow("REDIRECT:/creating/synthetic");
});

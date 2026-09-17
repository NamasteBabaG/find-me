// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { publicBeachDemo } from "../../../../../content/demo/beach-v1";
import { getDict } from "@/i18n";

const rig = vi.hoisted(() => ({ resolve: vi.fn(), user: vi.fn(), game: vi.fn() }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: rig.game } } }) }));
vi.mock("@/services/share-link.service", () => ({ resolvePlayToken: rig.resolve }));
vi.mock("@/services/asset.service", () => ({ withFreshAssetUrls: (_c: unknown, config: unknown) => config }));
vi.mock("@/lib/server/session", () => ({ currentUser: rig.user }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: getDict("en") }) }));
vi.mock("@/game/components/GameShell", () => ({ GameShell: () => null }));
import PlayPage from "../page";

beforeEach(() => {
  vi.stubGlobal("React", React);
  rig.resolve.mockResolvedValue({ ok: true, game: { id: "fixture", configJson: JSON.stringify(publicBeachDemo("en")) } });
  rig.game.mockResolvedValue({ ownerId: "owner" });
  rig.user.mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const page = () => PlayPage({ params: Promise.resolve({ token: "shr_fixture.test" }) });

it.each([null, { id: "other-parent" }])("keeps an anonymous or non-owner recipient in the player: %j", async user => {
  rig.user.mockResolvedValue(user);
  const result = await page();
  expect(result.props.albumOwner).toBe(false);
  expect(result.props.parentZoneHref).toBeUndefined();
});

it("preserves account-backed progress and family navigation for the verified owner", async () => {
  rig.user.mockResolvedValue({ id: "owner" });
  const result = await page();
  expect(result.props.albumOwner).toBe(true);
  expect(result.props.parentZoneHref).toBe("/library");
});

it.each(["invalid", "revoked", "not-ready"])("does not send recipients to the website when a link is %s", async reason => {
  rig.resolve.mockResolvedValue({ ok: false, reason });
  const view = render(await page());
  expect(view.container.querySelector("h1")).toBeTruthy();
  expect(view.container.querySelector("a[href]")).toBeNull();
  expect(rig.user).not.toHaveBeenCalled();
});

it("also keeps a not-yet-published config inside the shared experience", async () => {
  rig.resolve.mockResolvedValue({ ok: true, game: { id: "fixture", configJson: null } });
  const view = render(await page());
  expect(view.container.textContent).toContain(getDict("en").play.notReady);
  expect(view.container.querySelector("a[href]")).toBeNull();
});

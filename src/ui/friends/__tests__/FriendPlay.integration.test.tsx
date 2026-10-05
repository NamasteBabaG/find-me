// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import { emptyGuestSnapshot } from "@/domain/guest-sharing";
import { composeWorld } from "@/domain/game/compose";
import { GameConfigSchema } from "@/domain/game/config";
import type { GuestParticipantView } from "@/services/guest-sharing.service";
import { publicBeachDemo } from "../../../../content/demo/beach-v1";
import { findWorld } from "../../../../content/worlds";
import { FriendPlay } from "../FriendPlay";

vi.mock("@/game/audio/sounds", () => ({ sounds: () => ({ muted: false, restoreMutePreference() { return false; }, subscribeMuted() { return () => {}; }, unlock() {}, play() {}, setScene() {}, startAmbient() {}, stopAmbient() {} }), bindGameAudio: () => () => {} }));
const text = getDict("en").friends;
const shareId = `gsr_${"2".repeat(20)}`, token = `${shareId}.${"y".repeat(43)}`;
function fixture() {
  const config = publicBeachDemo("en"); config.gameId = "friend-shell-integration";
  const board = config.adventure!.boards[0]!, scene = config.scenes[0]!, world = composeWorld(findWorld("journey")!, config.child, "en");
  config.scenes = world.nodes.map(node => ({ ...structuredClone(scene), slug: node.boardSlug, name: `Place ${node.routeIndex}`, worldSlug: world.slug }));
  config.adventure!.boards = config.scenes.map(row => ({ ...structuredClone(board), boardSlug: row.slug, worldSlug: world.slug }));
  config.worlds = [world]; config.world = world;
  return GameConfigSchema.parse(config);
}
beforeEach(() => {
  vi.stubGlobal("React", React); window.localStorage.clear(); window.history.replaceState({}, "", `/#${token}`);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("friends with the actual game shell", () => {
  it("keeps owner and previous guest storage intact when a second participant starts, and settles projection updates", async () => {
    const config = fixture(), snapshot = emptyGuestSnapshot(), first = config.scenes[0]!;
    snapshot.visited.push(first.slug); snapshot.finds.push({ sceneSlug: first.slug, targetId: first.targets[0]!.id, variant: "A" });
    const old: GuestParticipantView = { id: "gpt_previous", nicknameId: "fox", revision: 1, snapshot };
    const next: GuestParticipantView = { id: "gpt_second", nicknameId: "star", revision: 0, snapshot: emptyGuestSnapshot() };
    let current = old;
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    const session = () => ({ shareId, worldSlug: "journey", worldName: "Around the World", childName: "Test", expiresAt: "2099-01-01T00:00:00.000Z", participant: current });
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (path === "/api/friends/progress") return new Response(JSON.stringify({ snapshot: body.snapshot }), { status: 200 });
      if (path === "/api/friends/play") return new Response(JSON.stringify({ config, participant: current, shareId, expiresAt: session().expiresAt }), { status: 200 });
      if (body.operation === "another") current = next;
      return new Response(JSON.stringify({ view: session() }), { status: 200 });
    }));
    const ownerKey = `findme:progress:v1:${config.gameId}`; window.localStorage.setItem(ownerKey, "owner-work-must-survive");
    const page = render(<I18nProvider locale="en" dict={getDict("en")}><FriendPlay /></I18nProvider>);
    fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" }));
    await page.findByText(/Playing as Fox/);
    const oldKey = `findme:progress:v1:friend:${shareId}:${old.id}`;
    await waitFor(() => expect(window.localStorage.getItem(oldKey)).not.toBeNull());
    const oldProgress = window.localStorage.getItem(oldKey)!;
    expect(JSON.parse(oldProgress).scenes[first.slug].foundTargetIds).toContain(first.targets[0]!.id);
    expect(page.queryByRole("button", { name: /My worlds/ })).toBeNull();
    expect(page.queryByRole("link", { name: /parent/i })).toBeNull();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    expect(calls.filter(call => call.path === "/api/friends/progress").length).toBeLessThanOrEqual(2);
    fireEvent.click(page.getByRole("button", { name: text.another }));
    fireEvent.click(await page.findByRole("button", { name: "Star" })); fireEvent.click(page.getByRole("button", { name: text.start }));
    await page.findByText(/Playing as Star/);
    expect(window.localStorage.getItem(oldKey)).toBe(oldProgress); expect(window.localStorage.getItem(ownerKey)).toBe("owner-work-must-survive");
    const currentKey = `findme:progress:v1:friend:${shareId}:${next.id}`;
    await waitFor(() => expect(window.localStorage.getItem(currentKey)).not.toBeNull());
    expect(JSON.parse(window.localStorage.getItem(currentKey)!).scenes[first.slug]?.foundTargetIds ?? []).toEqual([]);
    expect(calls.some(call => call.path.startsWith("/api/play/album"))).toBe(false);
    expect(calls.some(call => call.path.startsWith("/api/family/"))).toBe(false);
  });
});

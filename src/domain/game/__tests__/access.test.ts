import { describe, expect, it } from "vitest";
import { canManageGameCreation, draftBelongsTo } from "../access";

const game = { ownerId: "owner", draftToken: "browser-draft" };

describe("parent creation authority", () => {
  it.each([
    { label: "anonymous matching cookie", token: "browser-draft", userId: null, allowed: true },
    { label: "matching owner without cookie", token: null, userId: "owner", allowed: true },
    { label: "owner after another tab changed the cookie", token: "another-draft", userId: "owner", allowed: true },
    { label: "foreign session with valid draft proof", token: "browser-draft", userId: "other-parent", allowed: true },
    { label: "foreign cookie and session", token: "another-draft", userId: "other-parent", allowed: false },
    { label: "participant without parent or draft proof", token: null, userId: "guest-participant", allowed: false },
    { label: "signed-out browser without proof", token: null, userId: null, allowed: false },
  ])("keeps $label", ({ token, userId, allowed }) => {
    expect(draftBelongsTo(game, token, userId)).toBe(allowed);
    expect(canManageGameCreation(game, token, userId, false)).toBe(allowed);
  });

  it("permits an explicitly verified admin only for creation management", () => {
    expect(canManageGameCreation(game, null, "administrator", true)).toBe(true);
    expect(draftBelongsTo(game, null, "administrator")).toBe(false);
  });

  it.each([null, ""])("absent ownership fields never authorize an absent credential (%s)", absent => {
    expect(draftBelongsTo({ ownerId: absent, draftToken: absent }, absent, absent)).toBe(false);
    expect(canManageGameCreation({ ownerId: absent, draftToken: absent }, absent, absent, false)).toBe(false);
  });
});

// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict, tf, type Locale } from "@/i18n";
import { FamilyFriendSharing } from "../FamilyFriendSharing";

vi.mock("../FriendDiscoveries", () => ({ FriendDiscoveries: () => <div data-testid="discoveries-placeholder" /> }));
const text = getDict("en").friends.owner, worlds = [{ slug: "journey", name: "Around the World" }, { slug: "kingdom", name: "The Enchanted Kingdom" }];
const share = { id: "gsr_test", active: true, stale: false, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null };
function reply(body: object, status = 200) { return new Response(JSON.stringify(body), { status }); }
function mount(extra: { initialOpen?: boolean; initialWorld?: string } = {}, locale: Locale = "en") { return render(<I18nProvider locale={locale} dict={getDict(locale)}><FamilyFriendSharing gameId="game_test" worlds={worlds} {...extra} /></I18nProvider>); }
beforeEach(() => {
  vi.stubGlobal("React", React);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("parent-managed friends invitations", () => {
  it("reopens the requested owned world after parent freshness sign-in without creating an invitation automatically", async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return reply({ share: null }); }));
    const page = mount({ initialOpen: true, initialWorld: "kingdom" });
    const dialog = page.getByRole("dialog", { name: text.share });
    await waitFor(() => expect((within(dialog).getByRole("button", { name: text.create }) as HTMLButtonElement).getAttribute("aria-busy")).toBeNull());
    expect((within(dialog).getByRole("combobox", { name: text.selectWorld }) as HTMLSelectElement).value).toBe("kingdom");
    expect(calls).toEqual([expect.objectContaining({ gameId: "game_test", worldSlug: "kingdom", operation: "status" })]);
    expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).checked).toBe(false);
    expect((within(dialog).getByRole("button", { name: text.create }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("falls back to an owned world when a forged return world is supplied", async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return reply({ share: null }); }));
    const page = mount({ initialOpen: true, initialWorld: "someone-elses-world" });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((page.getByRole("combobox", { name: text.selectWorld }) as HTMLSelectElement).value).toBe("journey");
    expect(calls[0]!.worldSlug).toBe("journey");
  });
  it("gets explicit consent before creating and shows pending feedback, then copies only the returned invitation", async () => {
    let resolve!: (value: Response) => void; const pending = new Promise<Response>(done => { resolve = done; });
    const calls: Record<string, unknown>[] = [], clipboard = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); calls.push(body); return body.operation === "create" ? pending : reply({ share: null }); }));
    const page = mount(); fireEvent.click(page.getByRole("button", { name: text.share }));
    const dialog = page.getByRole("dialog", { name: text.share });
    const create = within(dialog).getByRole("button", { name: text.create });
    await waitFor(() => expect(create.getAttribute("aria-busy")).toBeNull());
    expect((create as HTMLButtonElement).disabled).toBe(true); expect(calls.some(body => body.operation === "create")).toBe(false);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: text.consent })); fireEvent.click(create); fireEvent.click(create);
    expect((create as HTMLButtonElement).disabled).toBe(true); expect(create.getAttribute("aria-busy")).toBe("true");
    expect((within(dialog).getByRole("combobox", { name: text.selectWorld }) as HTMLSelectElement).disabled).toBe(true);
    expect(calls.filter(body => body.operation === "create")).toEqual([expect.objectContaining({ consent: true })]);
    const invitation = "https://findme.example.invalid/friends#synthetic-invitation";
    await act(async () => { resolve(reply({ share, url: invitation })); });
    expect((within(dialog).getByRole("textbox", { name: text.copy }) as HTMLInputElement).value).toBe(invitation);
    expect(within(dialog).getByText(text.linkOnce)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: text.copy }));
    await within(dialog).findByRole("button", { name: text.copied }); expect(clipboard).toHaveBeenCalledExactlyOnceWith(invitation);
  });
  for (const locale of ["en", "he"] as const) {
    it.each([
      { reason: "updated", record: { ...share, active: false, stale: true }, key: "stale" as const, date: null },
      { reason: "closed", record: { ...share, active: false, revokedAt: "2026-10-03T12:00:00.000Z" }, key: "revoked" as const, date: "2026-10-03T12:00:00.000Z" },
      { reason: "expired", record: { ...share, active: false, expiresAt: "2000-01-01T00:00:00.000Z" }, key: "expired" as const, date: "2000-01-01T00:00:00.000Z" },
    ])(`${locale}: identifies an invitation as $reason without calling it open or creating another`, async ({ record, key, date }) => {
      const fetch = vi.fn(async (_path: string, _init: RequestInit) => reply({ share: record })); vi.stubGlobal("fetch", fetch);
      const copy = getDict(locale).friends.owner, page = mount({ initialOpen: true }, locale);
      const dialog = page.getByRole("dialog", { name: copy.share });
      const expected = date ? tf(copy[key], { date: new Date(date).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB") }) : copy[key];
      await within(dialog).findByText(expected);
      expect(within(dialog).queryByText(copy.active)).toBeNull();
      expect(within(dialog).queryByText(copy.inactive)).toBeNull();
      expect(within(dialog).queryByText(copy.linkHidden)).toBeNull();
      expect(within(dialog).queryByRole("button", { name: copy.rotate })).toBeNull();
      expect((within(dialog).getByRole("button", { name: copy.create }) as HTMLButtonElement).disabled).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).operation).toBe("status");
    });
  }
  it("explains why an active invitation's link cannot be shown again after reopening", async () => {
    const invitation = "https://findme.example.invalid/friends#synthetic-invitation";
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); return reply(body.operation === "create" ? { share, url: invitation } : { share: null });
    }));
    const page = mount({ initialOpen: true }); let dialog = page.getByRole("dialog", { name: text.share });
    await waitFor(() => expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: text.consent })); fireEvent.click(within(dialog).getByRole("button", { name: text.create }));
    await within(dialog).findByText(text.linkOnce);
    expect((within(dialog).getByRole("textbox", { name: text.copy }) as HTMLInputElement).value).toBe(invitation);
    vi.stubGlobal("fetch", vi.fn(async () => reply({ share, url: null })));
    fireEvent.click(within(dialog).getByRole("button", { name: getDict("en").friends.close }));
    fireEvent.click(page.getByRole("button", { name: text.share })); dialog = page.getByRole("dialog", { name: text.share });
    await within(dialog).findByText(text.linkHidden);
    expect(within(dialog).queryByRole("textbox", { name: text.copy })).toBeNull();
    expect(within(dialog).queryByText(text.linkOnce)).toBeNull();
    expect((within(dialog).getByRole("button", { name: text.rotate }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("asks specifically before replacement, allows cancellation, then sends consent once after confirmation", async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body); return reply({ share, ...(body.operation === "rotate" ? { url: "https://findme.example.invalid/friends#new-invitation" } : {}) });
    }));
    const page = mount({ initialOpen: true }), dialog = page.getByRole("dialog", { name: text.share });
    await within(dialog).findByText(text.active);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: text.consent })); fireEvent.click(within(dialog).getByRole("button", { name: text.rotate }));
    let confirm = page.getByRole("dialog", { name: text.rotate });
    expect(within(confirm).getByText(text.replaceConfirm)).toBeTruthy(); expect(within(confirm).queryByText(text.cache)).toBeNull();
    expect(calls.map(body => body.operation)).toEqual(["status"]);
    fireEvent.click(within(confirm).getByRole("button", { name: getDict("en").friends.back }));
    expect(page.queryByRole("dialog", { name: text.rotate })).toBeNull(); expect(calls).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: text.rotate })); confirm = page.getByRole("dialog", { name: text.rotate });
    fireEvent.click(within(confirm).getByRole("button", { name: text.rotate }));
    await within(dialog).findByText(text.linkOnce);
    expect(calls.filter(body => body.operation === "rotate")).toEqual([expect.objectContaining({ consent: true })]);
  });
  it("closes an invitation without requiring or sending sharing consent", async () => {
    const calls: Record<string, unknown>[] = [], closed = { ...share, active: false, revokedAt: "2026-10-03T12:00:00.000Z" };
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body); return reply({ share: body.operation === "revoke" ? closed : share });
    }));
    const page = mount({ initialOpen: true }), dialog = page.getByRole("dialog", { name: text.share });
    await within(dialog).findByText(text.active);
    expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: text.revoke }));
    const confirm = page.getByRole("dialog", { name: text.revoke });
    expect(within(dialog).queryByRole("checkbox", { name: text.consent })).toBeNull();
    expect(within(confirm).getByText(text.cache)).toBeTruthy(); expect(within(confirm).queryByText(text.replaceConfirm)).toBeNull();
    fireEvent.click(within(confirm).getByRole("button", { name: text.revoke }));
    await within(dialog).findByText(tf(text.revoked, { date: new Date(closed.revokedAt).toLocaleDateString("en-GB") }));
    expect(calls.filter(body => body.operation === "revoke")).toEqual([expect.not.objectContaining({ consent: expect.anything() })]);
  });
  it("selects the returned link and provides manual copying feedback when the clipboard refuses it", async () => {
    const clipboard = vi.fn().mockRejectedValueOnce(Error("blocked")).mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
    const invitation = "https://findme.example.invalid/friends#synthetic-invitation";
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); return reply(body.operation === "create" ? { share, url: invitation } : { share: null });
    }));
    const page = mount({ initialOpen: true }), dialog = page.getByRole("dialog", { name: text.share });
    await waitFor(() => expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: text.consent })); fireEvent.click(within(dialog).getByRole("button", { name: text.create }));
    const input = await within(dialog).findByRole("textbox", { name: text.copy }) as HTMLInputElement;
    fireEvent.click(within(dialog).getByRole("button", { name: text.copy }));
    await within(dialog).findByText(text.copyFailed);
    expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(invitation.length);
    expect(within(dialog).queryByRole("button", { name: text.copied })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: text.copy }));
    await within(dialog).findByRole("button", { name: text.copied });
    expect(within(dialog).queryByText(text.copyFailed)).toBeNull();
    expect(clipboard).toHaveBeenNthCalledWith(1, invitation); expect(clipboard).toHaveBeenNthCalledWith(2, invitation);
  });
  it.each(["rotate", "revoke"] as const)("closes the %s confirmation when parent freshness is required, allowing reauth", async operation => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      return reply(body.operation === "status" ? { share } : body.operation === "reauth" ? { ok: true } : { needsAdult: true });
    }));
    const page = mount({ initialOpen: true }); const dialog = page.getByRole("dialog", { name: text.share });
    await within(dialog).findByText(text.active); fireEvent.click(within(dialog).getByRole("checkbox", { name: text.consent }));
    const label = text[operation]; fireEvent.click(within(dialog).getByRole("button", { name: label }));
    const confirm = page.getByRole("dialog", { name: label }); fireEvent.click(within(confirm).getByRole("button", { name: label }));
    await within(dialog).findByText(text.adult);
    expect(page.queryByRole("dialog", { name: label })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: text.reauth }));
    await within(dialog).findByText(text.emailed);
    expect((within(dialog).getByRole("button", { name: text.reauth }) as HTMLButtonElement).disabled).toBe(true);
    expect(calls.filter(body => body.operation === "reauth")).toHaveLength(1);
  });
  it("clears stale reauth/email/consent state on reopening and reads current status", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); return reply(body.operation === "status" ? { share: null } : body.operation === "reauth" ? { ok: true } : { needsAdult: true });
    }));
    const page = mount({ initialOpen: true }); let dialog = page.getByRole("dialog", { name: text.share });
    await waitFor(() => expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: text.consent })); fireEvent.click(within(dialog).getByRole("button", { name: text.create }));
    fireEvent.click(await within(dialog).findByRole("button", { name: text.reauth })); await within(dialog).findByText(text.emailed);
    fireEvent.click(within(dialog).getByRole("button", { name: getDict("en").friends.close }));
    fireEvent.click(page.getByRole("button", { name: text.share })); dialog = page.getByRole("dialog", { name: text.share });
    await waitFor(() => expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).disabled).toBe(false));
    expect(within(dialog).queryByText(text.emailed)).toBeNull(); expect(within(dialog).queryByRole("button", { name: text.reauth })).toBeNull();
    expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).checked).toBe(false);
  });
  it("discards an old world's delayed action response after the parent closes and chooses another world", async () => {
    let resolve!: (value: Response) => void; const pending = new Promise<Response>(done => { resolve = done; });
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); return body.operation === "create" ? pending : reply({ share: null }); }));
    const page = mount({ initialOpen: true }); let dialog = page.getByRole("dialog", { name: text.share });
    await waitFor(() => expect((within(dialog).getByRole("checkbox", { name: text.consent }) as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: text.consent })); fireEvent.click(within(dialog).getByRole("button", { name: text.create }));
    fireEvent.click(within(dialog).getByRole("button", { name: getDict("en").friends.close }));
    fireEvent.click(page.getByRole("button", { name: text.share })); dialog = page.getByRole("dialog", { name: text.share });
    await waitFor(() => expect((within(dialog).getByRole("combobox", { name: text.selectWorld }) as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(within(dialog).getByRole("combobox", { name: text.selectWorld }), { target: { value: "kingdom" } });
    await waitFor(() => expect((within(dialog).getByRole("combobox", { name: text.selectWorld }) as HTMLSelectElement).disabled).toBe(false));
    await act(async () => { resolve(reply({ share, url: "https://findme.example.invalid/friends#old-world" })); });
    expect((within(dialog).getByRole("combobox", { name: text.selectWorld }) as HTMLSelectElement).value).toBe("kingdom");
    expect(within(dialog).queryByRole("textbox", { name: text.copy })).toBeNull();
    expect(within(dialog).queryByText(text.active)).toBeNull();
  });
  it("can refresh a failed status read without creating or rotating anything", async () => {
    let fail = true; const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); calls.push(body); if (fail) throw new Error("offline"); return reply({ share }); }));
    const page = mount({ initialOpen: true }); const dialog = page.getByRole("dialog", { name: text.share });
    await within(dialog).findByText(text.error); fail = false;
    fireEvent.click(within(dialog).getByRole("button", { name: text.refresh })); await within(dialog).findByText(text.active);
    expect(calls.map(body => body.operation)).toEqual(["status", "status"]);
    expect(within(dialog).queryByText(text.error)).toBeNull();
  });
});

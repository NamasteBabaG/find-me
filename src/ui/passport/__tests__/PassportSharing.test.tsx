// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import { PassportSharing } from "../PassportSharing";

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps a hash-only active link revocable after reload without pretending it can recover the URL", async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const { operation } = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ active: operation !== "revoke", url: null }) };
  });
  vi.stubGlobal("fetch", fetcher);
  const copy = getDict("en").passportSharing;
  render(<I18nProvider locale="en" dict={getDict("en")}><PassportSharing childId="fam_example" /></I18nProvider>);
  fireEvent.click(screen.getByRole("button", { name: copy.title }));
  expect(await screen.findByText(copy.copyOnce)).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: copy.link })).toBeNull();
  expect((screen.getByRole("button", { name: copy.rotate }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: copy.revoke }));
  fireEvent.click(screen.getByRole("button", { name: copy.confirm }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe(copy.revoked));
  expect(screen.queryByRole("button", { name: copy.revoke })).toBeNull();
  expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)).operation)).toEqual(["status", "revoke"]);
});

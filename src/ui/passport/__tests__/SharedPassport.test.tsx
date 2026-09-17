// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import { SharedPassport } from "../SharedPassport";

beforeEach(() => { vi.stubGlobal("React", React); window.location.hash = "fixture-token"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ""; });
const mount = () => render(<I18nProvider locale="en" dict={getDict("en")}><SharedPassport /></I18nProvider>);

it("has no website exits while loading or viewing a read-only passport", async () => {
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ book: { name: "Demo", preparing: 0, worlds: [] } }) }));
  vi.stubGlobal("fetch", fetcher);
  const view = mount();
  expect(view.container.querySelector("a[href]")).toBeNull();
  await waitFor(() => expect(view.container.querySelector(".travel-passport")).toBeTruthy());
  expect(view.container.querySelector("a[href]")).toBeNull();
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/passport/view");
});

it("keeps unavailable links local with a retry, not a homepage exit", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  const view = mount();
  expect(await screen.findByRole("button", { name: getDict("en").travelPassport.retry })).toBeTruthy();
  expect(view.container.querySelector("a[href]")).toBeNull();
});

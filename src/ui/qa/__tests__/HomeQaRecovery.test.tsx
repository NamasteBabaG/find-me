// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import { HomeQaRecovery, useHomeQaRecovery } from "../HomeQaRecovery";

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Probe() {
  const [failed, setFailed] = useState(false), [finds, setFinds] = useState(0);
  const qa = useHomeQaRecovery(true, failed, () => setFailed(false));
  return <><button onClick={() => setFinds(n => n + 1)}>find</button><span>finds {finds}</span>
    <button onClick={() => setFailed(true)}>decoder failure</button>
    <span>{failed ? qa?.required ? "sign in" : "retry" : "ready"}</span></>;
}
function mount(enabled = true, locale: "en" | "he" = "en") {
  return render(<I18nProvider locale={locale} dict={getDict(locale)}><HomeQaRecovery enabled={enabled}>
    <img src="/hero.webp" alt="hero" /><img src="/world.webp" alt="world" /><Probe />
  </HomeQaRecovery></I18nProvider>);
}
it.each(["en", "he"] as const)("shares one failure-triggered check across static art and off-DOM decoder, and preserves progress (%s)", async locale => {
  const fetcher = vi.fn().mockResolvedValue({ status: 401, json: async () => ({ code: "QA_ACCESS_REQUIRED" }) });
  vi.stubGlobal("fetch", fetcher); mount(true, locale);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("find"));
  await act(async () => {
    fireEvent.error(screen.getByAltText("hero")); fireEvent.error(screen.getByAltText("world"));
    fireEvent.click(screen.getByText("decoder failure"));
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByText("sign in")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(getDict(locale).travelPassport.qaHomeExpired);
  const link = screen.getByRole("link"); expect(link.getAttribute("href")).toBe("/qa-access?next=%2F");
  expect(link.getAttribute("target")).toBe("_blank");
  fetcher.mockResolvedValue({ status: 204 });
  await act(async () => { fireEvent(window, new Event("focus")); });
  expect(fetcher).toHaveBeenCalledTimes(2); expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("ready")).toBeTruthy(); expect(screen.getByText("finds 1")).toBeTruthy();
});
it.each([204, 404, 503, 401])("does not call generic %s an expired session", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, json: async () => ({ code: "OTHER" }) })); mount();
  await act(async () => { fireEvent.click(screen.getByText("decoder failure")); });
  expect(screen.queryByRole("link")).toBeNull(); expect(screen.getByText("retry")).toBeTruthy();
});
it("is inert outside the QA home boundary", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); mount(false);
  await act(async () => { fireEvent.error(screen.getByAltText("hero")); fireEvent.click(screen.getByText("decoder failure")); });
  expect(fetcher).not.toHaveBeenCalled(); expect(screen.queryByRole("link")).toBeNull();
});
it("does not probe a remote or inline image failure", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); mount();
  const image = screen.getByAltText("hero") as HTMLImageElement;
  image.src = "https://elsewhere.example/image.webp";
  await act(async () => fireEvent.error(image));
  image.src = "data:image/png;base64,AA";
  await act(async () => fireEvent.error(image));
  expect(fetcher).not.toHaveBeenCalled();
});

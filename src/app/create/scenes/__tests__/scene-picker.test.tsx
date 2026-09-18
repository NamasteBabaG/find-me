// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import { ScenePicker } from "../ScenePicker";

vi.mock("../../actions", () => ({ chooseScenesAction: vi.fn() }));
const prefetch = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const options = ["journey", "kingdom", "timetravel"].map(slug => ({ slug, name: slug, tagline: "Nine places", thumbnail: "/demo.webp" }));
const submitted = (container: HTMLElement) => [...container.querySelectorAll<HTMLInputElement>('input[name="scene"]')].map(input => input.value);

describe("accessible independent-world selection", () => {
  it.each(["en", "he"] as const)("switches a one-world selection with one click in %s", locale => {
    const dict = locale === "he" ? he : en;
    const view = render(<I18nProvider locale={locale} dict={dict}><ScenePicker scenes={options} want={1} preselected={["journey"]} /></I18nProvider>);
    const kingdom = view.getByRole("button", { name: /kingdom/ });
    expect(kingdom.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(kingdom);
    expect(kingdom.getAttribute("aria-pressed")).toBe("true");
    expect(submitted(view.container)).toEqual(["kingdom"]);
    expect((view.getByRole("button", { name: new RegExp(dict.create.scenes.next) }) as HTMLButtonElement).disabled).toBe(false);
    expect(view.container.querySelector(".pick--locked")).toBeNull();
  });
  it("requires the exact multi-world count and never silently replaces a choice", () => {
    const view = render(<I18nProvider locale="en" dict={en}><ScenePicker scenes={options} want={2} preselected={["journey", "kingdom"]} /></I18nProvider>);
    const third = view.getByRole("button", { name: /timetravel/ });
    const next = view.getByRole("button", { name: /Continue to summary/ }) as HTMLButtonElement;
    expect(third.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(third); expect(submitted(view.container)).toEqual(["journey", "kingdom"]);
    fireEvent.click(view.getByRole("button", { name: /journey/ }));
    expect(next.disabled).toBe(true);
    fireEvent.click(third); expect(next.disabled).toBe(false);
    expect(submitted(view.container)).toEqual(["kingdom", "timetravel"]);
  });
  it("does not submit stale or duplicate preselected worlds", () => {
    const view = render(<I18nProvider locale="en" dict={en}><ScenePicker scenes={options} want={2} preselected={["missing", "missing"]} /></I18nProvider>);
    expect(submitted(view.container)).toEqual(["journey", "kingdom"]);
  });
});

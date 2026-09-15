// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import { Hero } from "../Hero";
import { Inside } from "../sections";

/**
 * The design pass of 2026-09-15: the hero's last mark moves in both languages
 * (the Hebrew title ends with "!", which the "?"-only rule never animated),
 * and "What's inside" wears one icon chip per promise instead of six checks.
 */
const language = vi.hoisted(() => ({ locale: "en" as "en" | "he" }));
vi.mock("@/i18n/client", () => ({
  useI18n: () => {
    const t = language.locale === "he" ? he : en;
    return { locale: language.locale, t, tf: (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k])) };
  },
}));
const child = { name: "Noa", avatarUrl: "/demo/noa-portrait.png" };
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("design pass: the hero title's last mark", () => {
  it.each(["en", "he"] as const)("lifts the closing mark of the %s title, whatever it is", (locale) => {
    language.locale = locale;
    const title = (locale === "he" ? he : en).home.hero.title;
    const view = render(<Hero child={child} />);
    const mark = view.container.querySelector(".hero4__q");
    expect(mark?.textContent).toBe(title.slice(-1));
    expect(["?", "!"]).toContain(mark?.textContent);
    expect(view.container.querySelector("#hero-title")?.textContent).toBe(title);
  });
});

describe("design pass: what's inside", () => {
  it("gives every promise its own icon chip and no check", () => {
    const view = render(<Inside t={en} locale="en" />);
    expect(view.container.querySelectorAll(".feature")).toHaveLength(6);
    expect(view.container.querySelectorAll(".feature__icon")).toHaveLength(6);
    expect(view.container.querySelector(".feature__check")).toBeNull();
    const icons = Array.from(view.container.querySelectorAll(".feature__icon"), (n) => n.textContent?.trim());
    expect(new Set(icons).size).toBe(6);
  });
});

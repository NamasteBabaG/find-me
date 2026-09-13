// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hero, coverPoint } from "../Hero";
import found from "../../../../content/home/hero-found.json";

const language = vi.hoisted(() => ({ locale: "en" }));
vi.mock("@/i18n/client", () => ({
  useI18n: () => ({
    locale: language.locale,
    t: {
      home: { hero: { title: "Find me?", pill: "One photo", lead: "Lead", cta: "Create", demo: "Demo", found: "Found me!", devices: { phone: "Phone", tablet: "Tablet", laptop: "Computer" } } },
      game: { scene: { findChild: "Find {name}!", findAnyRules: "5 spots, find 3", hint: "Hint" } },
    },
    tf: (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k])),
  }),
}));
const child = { name: "Noa", avatarUrl: "/demo/noa-portrait.png" };
beforeEach(() => {
  language.locale = "en";
  vi.stubGlobal("React", React);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("hero: the find on three devices", () => {
  it("re-aims the star when a language refresh moves the HUD without resizing the stage", () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function(this: HTMLElement) {
      if (this.hasAttribute("data-slot")) return language.locale === "en" ? 100 : 220;
      return 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function(this: HTMLElement) {
      return this.hasAttribute("data-slot") ? 16 : 0;
    });
    const view = render(<Hero child={child} />);
    const fly = view.container.querySelector<HTMLElement>("[data-fly]")!;
    expect(fly.style.getPropertyValue("--fx")).toBe("108.0px");
    language.locale = "he";
    view.rerender(<Hero child={child} />);
    expect(view.container.querySelector("[data-fly]")).toBe(fly);
    expect(fly.style.getPropertyValue("--fx")).toBe("228.0px");
  });
  it("shows the same game screen on a phone, a tablet, a laptop and the phone-sized card", () => {
    const view = render(<Hero child={child} />);
    const screens = Array.from(view.container.querySelectorAll("[data-screen]")).map(s => s.getAttribute("data-screen"));
    expect(screens).toEqual(["phone", "tablet", "laptop", "card"]);
    for (const screen of Array.from(view.container.querySelectorAll("[data-screen]"))) {
      // The tray shows what the game shows: five hiding spots, the first star landing.
      expect(screen.querySelectorAll(".hero4__slot")).toHaveLength(5);
      expect(screen.querySelectorAll(".hero4__landed")).toHaveLength(1);
      expect(screen.querySelector(".hero4__mission")?.textContent).toBe("Find Noa!");
      expect(screen.querySelector(".hero4__rules")?.textContent).toBe("5 spots, find 3");
      expect(screen.querySelector(".hero4__bubble")?.textContent).toBe("Found me!");
      expect(screen.querySelector(".hero4__face")?.getAttribute("src")).toBe(child.avatarUrl);
      // The find hangs off the child's head, somewhere inside the picture.
      const fx = screen.querySelector<HTMLElement>("[data-fx]")!;
      for (const v of [fx.style.left, fx.style.top]) expect(parseFloat(v)).toBeGreaterThan(15), expect(parseFloat(v)).toBeLessThan(85);
    }
  });
  it("loads the tall crop only where the phone is drawn, the wide crop everywhere else", () => {
    const view = render(<Hero child={child} />);
    const source = view.container.querySelector(".hero4__screen--phone source")!;
    expect(source.getAttribute("srcset")).toBe(found.crops.phone.src);
    expect(source.getAttribute("media")).toBe("(min-width: 721px)");
    for (const kind of ["tablet", "laptop", "card"]) expect(view.container.querySelector(`.hero4__screen--${kind} img`)?.getAttribute("src")).toBe(found.crops.wide.src);
  });
  it("separates identity and progress from the rules and hint in every preview", () => {
    const view = render(<Hero child={child} />);
    const ratio = view.container.querySelector<HTMLElement>(".hero4__card")!.style.aspectRatio;
    const [numerator, denominator = 1] = ratio.split("/").map(Number);
    expect(numerator! / denominator).toBeCloseTo(2 / 3);
    for (const screen of Array.from(view.container.querySelectorAll("[data-screen]"))) {
      const top = screen.querySelector(".hero4__hud-top")!;
      const footer = screen.querySelector(".hero4__hud-footer")!;
      expect(top.querySelector(".hero4__face")?.getAttribute("width")).toBe("56");
      expect(top.querySelector(".hero4__mission")?.textContent).toBe("Find Noa!");
      expect(top.querySelectorAll(".hero4__slot")).toHaveLength(5);
      expect(top.querySelector(".hero4__rules")).toBeNull();
      expect(top.querySelector(".hero4__hintbtn")).toBeNull();
      expect(footer.querySelector(".hero4__rules")).not.toBeNull();
      expect(footer.querySelector(".hero4__hintbtn")).not.toBeNull();
      expect(screen.querySelector(".hero4__hud")?.parentElement).toBe(screen.querySelector(".hero4__rail")?.parentElement);
      expect(screen.querySelector(".hero4__hud")?.getAttribute("dir")).toBe("ltr");
    }
    language.locale = "he";
    view.rerender(<Hero child={child} />);
    expect(Array.from(view.container.querySelectorAll(".hero4__hud")).every(hud => hud.getAttribute("dir") === "rtl")).toBe(true);
  });
  it("keeps the introductory label quiet text, not a yellow button", () => {
    const view = render(<Hero child={child} />);
    const label = view.container.querySelector(".hero4__copy .hero4__pill")!;
    expect(label.tagName).toBe("SPAN");
    expect(label.classList.contains("fm-pill--sun")).toBe(false);
    expect(label.getAttribute("role")).not.toBe("button");
    expect(view.container.querySelector("h1")?.textContent).toBe("Find me?");
  });
  it("names the three devices in the visitor's language", () => {
    const view = render(<Hero child={child} />);
    expect(Array.from(view.container.querySelectorAll(".hero4__label")).map(l => l.textContent)).toEqual(["Phone", "Tablet", "Computer"]);
  });
});

describe("coverPoint", () => {
  it("follows a point through object-fit: cover", () => {
    // Same aspect: nothing moves.
    expect(coverPoint({ x: 0.3, y: 0.7 }, 1.5, 1.5)).toEqual({ x: 0.3, y: 0.7 });
    // A wide image in a square box loses its sides: the centre stays, a point left of it moves further left.
    expect(coverPoint({ x: 0.5, y: 0.5 }, 2, 1)).toEqual({ x: 0.5, y: 0.5 });
    expect(coverPoint({ x: 0.25, y: 0.5 }, 2, 1).x).toBeCloseTo(0);
    // A tall image in a wide box loses top and bottom.
    expect(coverPoint({ x: 0.5, y: 0.25 }, 0.5, 1).y).toBeCloseTo(0);
  });
});

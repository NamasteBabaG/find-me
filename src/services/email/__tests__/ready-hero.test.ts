import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findScene } from "../../../../content/scenes";
import { findWorld } from "../../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import { READY_MAIL_HEROES, readyMailHero } from "../ready-hero";
import { gameReadyEmail } from "../templates";

const app = "https://qa.example.invalid";
const worldScenes = (world: string, sceneVersion: number) => boardSlugs(findWorld(world)!).map(sceneSlug => ({ sceneSlug, sceneVersion }));

describe("the ready mail's board picture", () => {
  it("cuts every listed picture from real board art, and both files are in public/", () => {
    expect(Object.keys(READY_MAIL_HEROES)).toHaveLength(4);
    for (const [art, hero] of Object.entries(READY_MAIL_HEROES)) {
      expect(existsSync(path.join("public", art)), art).toBe(true);
      expect(existsSync(path.join("public", hero)), hero).toBe(true);
      expect(hero).toMatch(/^\/email\/[a-z0-9-]+\.jpg$/);
    }
  });

  it.each([
    ["kingdom", 13, "/email/kingdom-castlegate-detectives-v1.jpg"],
    ["kingdom", 12, "/email/magic-castlegate-v18.jpg"],
    ["journey", 13, "/email/journey-newyork-detectives-v1.jpg"],
    ["journey", 12, "/email/adventure-newyork.jpg"],
  ] as const)("shows %s v%s from the world's first board, in the art of the level played", (world, version, expected) => {
    for (const locale of ["en", "he"] as const) {
      const hero = readyMailHero(app, worldScenes(world, version), locale)!;
      expect(hero.src).toBe(app + expected);
      expect(hero.worldTitle).toBe(findWorld(world)!.name[locale]);
      expect(hero.tint).toBe(findScene(boardSlugs(findWorld(world)!)[0]!, version)!.art.palette.sky);
    }
  });

  it("follows the first board even when the game lists its boards in another order", () => {
    const scenes = worldScenes("kingdom", 13).reverse();
    expect(readyMailHero(app, scenes, "he")!.src).toBe(app + "/email/kingdom-castlegate-detectives-v1.jpg");
  });

  it("has no picture for a board version without one, an unknown board, or no boards", () => {
    expect(readyMailHero(app, worldScenes("kingdom", 9), "en")).toBeNull();
    expect(readyMailHero(app, [{ sceneSlug: "not-a-board", sceneVersion: 13 }], "en")).toBeNull();
    expect(readyMailHero(app, [], "en")).toBeNull();
    // The first board is missing from this game, so it is not shown a board it does not have.
    expect(readyMailHero(app, worldScenes("kingdom", 13).slice(1), "en")).toBeNull();
  });

  it("never throws into the READY transaction: an unusable site address means no picture", () => {
    expect(readyMailHero("not a url", worldScenes("kingdom", 13), "en")).toBeNull();
  });
});

describe("the ready mail with and without its picture", () => {
  const base = { to: "parent@example.invalid", childName: "Synthetic", playLink: `${app}/play/token`, libraryLink: `${app}/library/g`, sceneCount: 9, playMode: "find-any" as const, targetCount: 27 };

  it.each(["en", "he"] as const)("puts the board above the title and the world's name on its pill (%s)", locale => {
    const hero = readyMailHero(app, worldScenes("kingdom", 13), locale)!;
    const mail = gameReadyEmail({ ...base, locale, hero });
    expect(mail.html).toContain(`<img src="${app}/email/kingdom-castlegate-detectives-v1.jpg" width="520" alt="${hero.worldTitle}"`);
    expect(mail.html.indexOf("<img")).toBeLessThan(mail.html.indexOf("<h1"));
    expect(mail.html.match(new RegExp(hero.worldTitle, "g"))!.length).toBe(2);
    expect(mail.html).toContain(`bgcolor="${hero.tint}"`);
    // The plain-text part and the button are the same as before.
    expect(mail.text).toBe(gameReadyEmail({ ...base, locale }).text);
    expect(mail.html).toContain(`href="${app}/play/token"`);
  });

  it("stays text only without a picture", () => {
    for (const hero of [undefined, null]) expect(gameReadyEmail({ ...base, locale: "en", hero }).html).not.toContain("<img");
  });

  it("escapes the picture's address and name and never lets a colour out of its hex value", () => {
    const mail = gameReadyEmail({ ...base, locale: "en", hero: { src: `${app}/email/x.jpg?a="b`, worldTitle: "<b>World</b>", tint: "red;background:url(x)" } });
    expect(mail.html).toContain(`src="${app}/email/x.jpg?a=&quot;b"`);
    expect(mail.html).toContain("&lt;b&gt;World&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>World</b>");
    expect(mail.html).not.toContain("url(x)");
    expect(mail.html).toContain('bgcolor="#FFF8E8"');
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../../container";
import { WORLD_LOCAL_PATCH_HIDES } from "../../../domain/scene/local-patch-hides";
import { sceneBySlug } from "../../scene-catalog.service";
import { LOCAL_PATCH_STYLE } from "../local-patch-world";
import { preflightLocalPatchIdentity } from "../local-patch-identity";

const settings = vi.hoisted(() => ({ appEnv: "qa", model: "gpt-image-2", enabled: "on" }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: settings.appEnv, GENERATION_ENABLED: settings.enabled, GENERATION_PROVIDER: "openai",
    GENERATION_MODEL: settings.model, GENERATION_QUALITY: "medium", GENERATION_DAILY_CENTS: 0 }),
  spendGuard: () => ({ appEnv: settings.appEnv, realGeneration: true, testers: ["synthetic@example.invalid"] }),
}));

beforeEach(() => { settings.appEnv = "qa"; settings.model = "gpt-image-2"; settings.enabled = "on"; });

function fixture() {
  const generate = vi.fn(async () => { throw new Error("Preflight must not buy anything"); });
  const game = { styleVersion: LOCAL_PATCH_STYLE, ownerId: "synthetic-owner", deletedAt: null, packageTier: "ONE_WORLD",
    scenes: WORLD_LOCAL_PATCH_HIDES.map(board => ({ sceneSlug: board.board, sceneVersion: sceneBySlug(board.board, 6).version })) };
  const c = { storage: { id: "db" }, avatars: { id: "openai", createCharacter: generate },
    db: { game: { findUniqueOrThrow: async () => game }, user: { findUnique: async () => ({ email: "synthetic@example.invalid" }) } } } as unknown as Container;
  return { c, game, generate };
}

describe("free local-patch identity preflight", () => {
  it("verifies all nine actually packaged boards with the old wizard disabled", async () => {
    const f = fixture(), old = process.env.QA_BOARD_CONDITIONED_WIZARD;
    process.env.QA_BOARD_CONDITIONED_WIZARD = "false";
    try { await preflightLocalPatchIdentity(f.c, "synthetic"); }
    finally { if (old === undefined) delete process.env.QA_BOARD_CONDITIONED_WIZARD; else process.env.QA_BOARD_CONDITIONED_WIZARD = old; }
    expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(["production", "wrong-model", "off", "wrong-world", "no-character"])("stops before spending when %s", async reason => {
    const f = fixture();
    if (reason === "production") settings.appEnv = "production";
    if (reason === "wrong-model") settings.model = "gpt-image-1";
    if (reason === "off") settings.enabled = "off";
    if (reason === "wrong-world") f.game.scenes.pop();
    if (reason === "no-character") delete f.c.avatars.createCharacter;
    await expect(preflightLocalPatchIdentity(f.c, "synthetic")).rejects.toThrow();
    expect(f.generate).not.toHaveBeenCalled();
  });
  it("rejects mixed content versions before any identity purchase", async () => {
    const f = fixture(); f.game.scenes[0]!.sceneVersion = 7;
    await expect(preflightLocalPatchIdentity(f.c, "synthetic")).rejects.toThrow("one pinned content version");
    expect(f.generate).not.toHaveBeenCalled();
  });
});

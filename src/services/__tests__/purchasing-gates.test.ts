import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../container";

const f = vi.hoisted(() => ({ settings: { APP_ENV: "production", PURCHASING_ENABLED: "off" } }));
vi.mock("@/lib/env", async original => ({ ...await original<typeof import("@/lib/env")>(), env: () => f.settings }));
import { startCheckout } from "../order.service";
import { attachPhoto } from "../create-flow.service";
import { beginWorldPurchase } from "../world-purchase.service";

beforeEach(() => { f.settings = { APP_ENV: "production", PURCHASING_ENABLED: "off" }; });

describe("production prelaunch service boundaries", () => {
  function untouchedContainer() {
    const database = vi.fn(() => { throw new Error("Database must not be accessed"); });
    const payment = vi.fn(), storage = vi.fn(), faces = vi.fn();
    const c = { get db() { return database(); }, payment: { createCheckout: payment }, storage: { put: storage }, faces: { detect: faces } } as unknown as Container;
    return { c, database, payment, storage, faces };
  }

  it("checkout refuses before owner/order writes, provider dispatch, or even a database read", async () => {
    const spies = untouchedContainer();
    expect(await startCheckout(spies.c, { gameId: "synthetic-draft", email: "parent@example.invalid", currency: "ILS", access: { userId: null, draftToken: "synthetic-token" } })).toMatchObject({ ok: false, code: "PURCHASING_CLOSED" });
    expect(spies.database).not.toHaveBeenCalled(); expect(spies.payment).not.toHaveBeenCalled();
  });

  it("draft photo storage and checks refuse before reading the draft or bytes", async () => {
    const spies = untouchedContainer();
    expect(await attachPhoto(spies.c, "synthetic-draft", { buffer: Buffer.from("synthetic"), mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "PURCHASING_CLOSED" });
    expect(spies.database).not.toHaveBeenCalled(); expect(spies.storage).not.toHaveBeenCalled(); expect(spies.faces).not.toHaveBeenCalled();
  });

  it("continuation refuses before creating a child profile, draft or purchase intent", async () => {
    const spies = untouchedContainer();
    expect(await beginWorldPurchase(spies.c, { ownerId: "synthetic-owner", familyChildId: "synthetic-child", worldSlug: "kingdom", ageYears: 8, locale: "en" })).toMatchObject({ ok: false, code: "PURCHASING_CLOSED" });
    expect(spies.database).not.toHaveBeenCalled(); expect(spies.payment).not.toHaveBeenCalled();
  });

  it.each(["qa", "development"])("%s retains the ordinary service validation rather than a production closure", async appEnv => {
    f.settings = { APP_ENV: appEnv, PURCHASING_ENABLED: "off" };
    const c = untouchedContainer().c;
    expect(await beginWorldPurchase(c, { ownerId: "synthetic-owner", familyChildId: "synthetic-child", worldSlug: "kingdom", ageYears: 100, locale: "en" })).toMatchObject({ ok: false, code: "INVALID_CHILD_AGE" });
  });
});

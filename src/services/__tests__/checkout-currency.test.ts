import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { MockPaymentProvider } from "@/infra/payment/mock";
import { startCheckout } from "../order.service";
import { boardsOfWorlds } from "../world-catalog.service";
import { priceFor } from "@/domain/package";
import type { Container } from "../container";

vi.mock("@/domain/spend-policy", () => ({ spendAllowedFor: () => true }));
let scratch: string, db: PrismaClient, sequence = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-checkout-currency-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
});
afterAll(async () => {
  await db?.$disconnect();
  const absolute = path.resolve(scratch);
  if (path.dirname(absolute) === realpathSync(tmpdir()) && path.basename(absolute).startsWith("findme-checkout-currency-")) rmSync(absolute, { recursive: true, force: true });
});

describe("checkout currency contract", () => {
  it.each([undefined, "he", "en", "EUR", ""])('rejects %s before any database or payment side effect', async currency => {
    await expect(startCheckout(null as unknown as Container, { gameId: "test", email: "test@example.invalid", currency: currency as never, access: { draftToken: null, userId: null } })).rejects.toThrow("server-resolved currency");
  });
  // Read catalogue prices rather than restating mutable product policy here.
  it.each([
    ["he", "USD", priceFor("ONE_WORLD", "USD")], ["en", "ILS", priceFor("ONE_WORLD", "ILS")],
    ["he", "ILS", priceFor("ONE_WORLD", "ILS")], ["en", "USD", priceFor("ONE_WORLD", "USD")],
  ] as const)("preserves server currency %s/%s in both the durable order and provider request", async (locale, currency, amount) => {
    const id = `currency-${++sequence}`, userId = `${id}-owner`, profileId = `${id}-profile`, photoId = `${id}-photo`, email = `${id}@example.invalid`;
    await db.user.create({ data: { id: userId, email } });
    await db.asset.create({ data: { id: photoId, ownerId: userId, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", mimeType: "image/png", storagePath: `private/synthetic-${photoId}.png` } });
    await db.childProfile.create({ data: { id: profileId, ownerId: userId, displayName: "Synthetic", ageYears: 8, originalPhotoAssetId: photoId } });
    await db.game.create({ data: { id, ownerId: userId, draftToken: `${id}-cookie`, childProfileId: profileId, locale, status: "PACKAGE_SELECTED", packageTier: "ONE_WORLD", sceneCount: 9,
      scenes: { create: boardsOfWorlds(["journey"]).map((sceneSlug, orderIndex) => ({ id: `${id}-${orderIndex}`, sceneSlug, sceneVersion: 12, orderIndex })) } } });
    const payment = new MockPaymentProvider("https://example.invalid", "synthetic-currency-secret"), provider = vi.spyOn(payment, "createCheckout");
    const c = { db, appUrl: "https://example.invalid", payment, analytics: { track: vi.fn() } } as unknown as Container;
    expect(await startCheckout(c, { gameId: id, email, currency, access: { draftToken: `${id}-cookie`, userId } })).toMatchObject({ ok: true });
    expect(await db.order.findFirstOrThrow({ where: { gameId: id } })).toMatchObject({ currency, amountAgorot: amount, checkoutKey: `world-checkout:${id}`, checkoutClaimUntil: null });
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ currency, amountAgorot: amount, idempotencyKey: expect.any(String) }));
  });
});

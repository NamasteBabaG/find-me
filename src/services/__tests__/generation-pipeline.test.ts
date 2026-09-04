import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AvatarProvider, SlotPatchRequest, SlotPatchResponse } from "@/infra/generation/types";
import type { Container } from "../container";

/**
 * The generation pipeline, against a real database.
 *
 * Every bug this file pins down was an orchestration bug, and most of them were
 * database-level: two runners claiming one job, a lease held after a slice ends,
 * a cost counter that re-added history, a world composed while a child was still
 * missing from it. A fake `db` would fake away the very thing under test — an
 * `updateMany` that matches zero rows is what makes the lease a lease — so this
 * runs against SQLite. The image model is stubbed, because what it draws is not
 * what is being tested here.
 */

type Db = Container["db"];

let dir: string;
let db: Db;
let mod: {
  runGenerationPipeline: (c: Container, gameId: string, options?: { deadlineAt?: number }) => Promise<void>;
  handlePaymentWebhook: (c: Container, rawBody: string, headers: Record<string, string | undefined>) => Promise<{ status: number; body: string }>;
  deleteGame: (c: Container, gameId: string, actor: unknown, userId?: string) => Promise<boolean>;
  SYSTEM: unknown;
  spotsOutstanding: (c: Container, gameId: string, variants: Array<"A" | "B">) => Promise<{ retryable: number; capped: number }>;
  MAX_ATTEMPTS_PER_SPOT: number;
  storeAsset: (c: Container, input: Record<string, unknown>) => Promise<{ id: string }>;
  LocalDiskStorage: new (root: string) => Container["storage"];
  NoopAnalytics: new () => Container["analytics"];
  sceneBySlug: (slug: string) => { slug: string; version: number; targets: unknown[] };
};

/** The scene every test uses: one real world, three real hiding spots. */
const SCENE = "beach";

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "findme-pipeline-"));
  const url = `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`;

  // The pipeline reads env through `env()`, which caches on first call, so every
  // knob has to be set before anything imports it. Hence the dynamic imports.
  process.env.DATABASE_URL = url;
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.APP_URL = "http://localhost:3000";
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
  process.env.STORAGE_LOCAL_DIR = dir;
  process.env.QA_AUTO_APPROVE = "false";
  process.env.GENERATION_BOTH_VARIANTS = "false";

  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  const { PrismaClient } = await import("@prisma/client");
  db = new PrismaClient({ datasources: { db: { url } } }) as unknown as Db;
  const [pipeline, patches, asset, local, analytics, catalog] = await Promise.all([
    import("../generation/pipeline"),
    import("../generation/slot-patches"),
    import("../asset.service"),
    import("@/infra/storage/local"),
    import("@/infra/analytics/console"),
    import("../scene-catalog.service"),
  ]);
  const order = await import("../order.service");
  const [game, auditMod] = await Promise.all([import("../game.service"), import("../audit.service")]);
  mod = {
    runGenerationPipeline: pipeline.runGenerationPipeline,
    handlePaymentWebhook: order.handlePaymentWebhook as never,
    deleteGame: game.deleteGame as never,
    SYSTEM: auditMod.SYSTEM,
    spotsOutstanding: patches.spotsOutstanding,
    MAX_ATTEMPTS_PER_SPOT: patches.MAX_ATTEMPTS_PER_SPOT,
    storeAsset: asset.storeAsset as never,
    LocalDiskStorage: local.LocalDiskStorage as never,
    NoopAnalytics: analytics.NoopAnalytics as never,
    sceneBySlug: catalog.sceneBySlug as never,
  };
}, 120_000);

afterAll(async () => {
  await (db as unknown as { $disconnect(): Promise<void> })?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

// ── The stub painter ────────────────────────────────────────────────────────

interface Painter extends AvatarProvider {
  calls: number;
  /** What each call should do, in order; the last entry repeats. */
  script: Array<"child" | "nothing" | "throw">;
}

/**
 * An image model that paints exactly what it is told to.
 *
 * It reads the paint mask it was handed to find the ellipse, then fills a
 * child-shaped one inside it — so a "child" run goes through the real diff,
 * blob-cleaning and shape checks rather than around them. "nothing" returns the
 * crop untouched, which is what a rejected roll actually looks like.
 */
function painter(script: Array<"child" | "nothing" | "throw"> = ["child"], costCents = 4): Painter {
  const p: Painter = {
    id: "openai",
    calls: 0,
    script,
    createAvatar: async () => ({ png: await solid(64, 64, "#f0c"), width: 64, height: 64, costCents: 1, model: "stub", attempts: 1, durationMs: 10 }),
    createTargetSprite: async () => ({ kind: "composed" as const, costCents: 0, model: "stub", attempts: 1, durationMs: 0 }),
    createCharacter: async () => {
      const sheet = await solid(256, 256, "#fc0");
      return { sheetPng: sheet, sheetWidth: 256, sheetHeight: 256, avatarPng: await solid(64, 64, "#fc0"), avatarWidth: 64, avatarHeight: 64, costCents: 5, model: "stub", attempts: 1, durationMs: 10 };
    },
    editSlotCrop: async (req: SlotPatchRequest): Promise<SlotPatchResponse> => {
      const step = p.script[Math.min(p.calls, p.script.length - 1)] ?? "child";
      p.calls++;
      if (step === "throw") throw new Error("provider exploded");
      if (step === "nothing") return { png: req.crop, costCents, attempts: 1, durationMs: 10, model: "stub" };
      return { png: await paintChild(req), costCents, attempts: 1, durationMs: 10, model: "stub" };
    },
  };
  return p;
}

async function solid(w: number, h: number, colour: string): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: colour } })
    .png()
    .toBuffer();
}

/** Fill a child-sized ellipse inside the mask's ellipse, in a colour the crop does not contain. */
async function paintChild(req: SlotPatchRequest): Promise<Buffer> {
  const { info, data } = await sharp(req.paintMask).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x]! < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  // paintMask draws ry = 0.8 * childPx, so the white ellipse is 1.6 childPx tall.
  const childPx = (y1 - y0 + 1) / 1.6;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${childPx * 0.275}" ry="${childPx * 0.5}" fill="#ff00e5"/></svg>`,
  );
  return sharp(req.crop).composite([{ input: overlay }]).png().toBuffer();
}

// ── Seeding ─────────────────────────────────────────────────────────────────

/** What the stub judge should say; a test flips this to exercise a rejection. */
let verdict: () => "ok" | "bad" | "unknown" = () => "ok";

function container(avatars: AvatarProvider): Container {
  return {
    db,
    storage: new mod.LocalDiskStorage(path.join(dir, "storage")),
    payment: null as never,
    avatars,
    judge: { id: "stub", judge: async () => ({ verdict: verdict(), reason: "stub", costCents: 0 }) },
    faces: { detect: async () => ({ count: 1, box: null }) },
    email: { id: "console", send: async () => ({ id: "mail_test" }) } as never,
    analytics: new mod.NoopAnalytics(),
    jobs: null as never,
    appUrl: "http://localhost:3000",
    secret: "test-secret-test-secret-test-secret",
  };
}

let seq = 0;

/** A paid game with one world, ready for the pipeline to pick up. */
async function seedGame(c: Container): Promise<string> {
  const n = ++seq;
  const user = await db.user.create({ data: { id: `usr_test_${n}`, email: `p${n}@example.com` } });
  const photo = await mod.storeAsset(c, {
    ownerId: user.id,
    type: "ORIGINAL_PHOTO",
    visibility: "PRIVATE",
    buffer: await solid(512, 512, "#8bd"),
    mimeType: "image/png",
    width: 512,
    height: 512,
  });
  const child = await db.childProfile.create({
    data: { id: `chd_test_${n}`, ownerId: user.id, displayName: "Noa", originalPhotoAssetId: photo.id, retainOriginalPhoto: true },
  });
  const game = await db.game.create({
    data: { id: `gam_test_${n}`, ownerId: user.id, childProfileId: child.id, packageTier: "ONE_WORLD", status: "PAID", sceneCount: 1, paidAt: new Date() },
  });
  const def = mod.sceneBySlug(SCENE);
  await db.gameScene.create({ data: { id: `gsc_test_${n}`, gameId: game.id, sceneSlug: def.slug, sceneVersion: def.version, orderIndex: 0 } });
  return game.id;
}

const spotsIn = (gameId: string) => db.targetInstance.findMany({ where: { gameScene: { gameId } }, include: { variants: true } });
const job = (gameId: string) => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
const gameOf = (gameId: string) => db.game.findUniqueOrThrow({ where: { id: gameId } });

// ── The tests ───────────────────────────────────────────────────────────────

describe("generation pipeline", () => {
  beforeEach(() => {
    seq += 100; // ids stay unique even if a test seeds several games
    verdict = () => "ok";
  });

  it("rejects a patch the judge says is not the child", async () => {
    // The shape checks pass a scooter, a horse's head and a pair of legs — over
    // one real game, four of twenty-six accepted patches were not her.
    verdict = () => "bad";
    const p = painter(["child"]);
    const c = container(p);
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    const spots = await spotsIn(gameId);
    expect(spots.every((s) => s.status === "NEEDS_REGENERATION")).toBe(true);
    expect(spots[0]!.variants[0]!.lastError).toContain("does not show");
    expect(spots[0]!.variants[0]!.assetId).toBeNull(); // nothing that failed identity is kept as the sprite
    expect((await job(gameId)).status).toBe("QUEUED"); // a retry, not a finished game
  }, 120_000);

  it("sends a game to a human when nothing could check the pictures", async () => {
    verdict = () => "unknown";
    const c = container(painter(["child"]));
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    const spots = await spotsIn(gameId);
    expect(spots.every((s) => s.status === "GENERATED")).toBe(true); // a broken judge must not throw work away
    const game = await gameOf(gameId);
    expect(game.status).toBe("MANUAL_REVIEW");
    expect(game.lastError).toContain("never checked");
  }, 120_000);

  it("paints every hiding spot and leaves the game waiting for QA", async () => {
    const p = painter(["child"]);
    const c = container(p);
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    const spots = await spotsIn(gameId);
    expect(spots).toHaveLength(3);
    expect(spots.every((s) => s.status === "GENERATED")).toBe(true);
    expect(p.calls).toBe(3);
    expect((await gameOf(gameId)).status).toBe("QA_PENDING");
    expect((await job(gameId)).status).toBe("DONE");
  }, 120_000);

  it("only one of two concurrent runners does the work", async () => {
    const p = painter(["child"]);
    const c = container(p);
    const gameId = await seedGame(c);

    await Promise.all([mod.runGenerationPipeline(c, gameId), mod.runGenerationPipeline(c, gameId), mod.runGenerationPipeline(c, gameId)]);

    // Three runners, one identity sheet and one roll per spot: the lease held.
    const sheets = await db.asset.count({ where: { type: "IDENTITY_SHEET", ownerId: { not: null } } });
    expect(sheets).toBeGreaterThan(0);
    expect(p.calls).toBe(3);
    const spots = await spotsIn(gameId);
    expect(spots.every((s) => s.variants.every((v) => v.attempts === 1))).toBe(true);
  }, 120_000);

  it("hands the lease back when the slice runs out of time", async () => {
    const c = container(painter(["child"]));
    const gameId = await seedGame(c);

    // A deadline already in the past: the avatar step runs, the first spot does not.
    await mod.runGenerationPipeline(c, gameId, { deadlineAt: Date.now() - 1 });

    const j = await job(gameId);
    expect(j.status).toBe("QUEUED"); // not RUNNING — the next tick must claim it at once
    expect(j.currentStep).toBe("targets");
    expect((await gameOf(gameId)).status).toBe("TARGETS_GENERATING");
  }, 120_000);

  it("does not compose while a hiding spot can still be retried", async () => {
    // One good spot, then rolls that paint nothing.
    const p = painter(["child", "nothing"]);
    const c = container(p);
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    const spots = await spotsIn(gameId);
    expect(spots.filter((s) => s.status === "GENERATED")).toHaveLength(1);
    expect(spots.filter((s) => s.status === "NEEDS_REGENERATION")).toHaveLength(2);
    // The game must NOT have reached QA with two children missing from the world.
    expect((await gameOf(gameId)).status).toBe("TARGETS_GENERATING");
    expect((await job(gameId)).status).toBe("QUEUED");
    const scene = await db.gameScene.findFirstOrThrow({ where: { gameId } });
    expect(scene.generationStatus).toBe("NEEDS_REGENERATION");
  }, 120_000);

  it("gives up on a spot after the attempt cap and sends the game to a human", async () => {
    const p = painter(["nothing"]);
    const c = container(p);
    const gameId = await seedGame(c);

    // Each tick spends one attempt per spot; run until every spot is capped.
    for (let i = 0; i < mod.MAX_ATTEMPTS_PER_SPOT + 1; i++) await mod.runGenerationPipeline(c, gameId);

    const spots = await spotsIn(gameId);
    expect(spots.every((s) => s.variants.every((v) => v.attempts === mod.MAX_ATTEMPTS_PER_SPOT))).toBe(true);
    expect(p.calls).toBe(3 * mod.MAX_ATTEMPTS_PER_SPOT); // capped means capped: no further spending

    const outstanding = await mod.spotsOutstanding(c, gameId, ["A"]);
    expect(outstanding).toEqual({ retryable: 0, capped: 3 });

    const game = await gameOf(gameId);
    expect(game.status).toBe("MANUAL_REVIEW");
    expect(game.lastError).toContain("could not be painted");
  }, 180_000);

  it("counts a spot's cost once, however many ticks it takes", async () => {
    // Two rolls that paint nothing, then one that works: three paid calls.
    const p = painter(["nothing", "nothing", "child"]);
    const c = container(p);
    const gameId = await seedGame(c);
    for (let i = 0; i < 4; i++) await mod.runGenerationPipeline(c, gameId);

    const spots = await spotsIn(gameId);
    const spot = spots.find((s) => s.variants[0]!.status === "GENERATED");
    expect(spot).toBeDefined();
    // 4 cents a roll. The spot itself knows what it cost; the target must agree,
    // instead of re-adding the whole history on every tick that touched it.
    const variantCost = spot!.variants.reduce((n, v) => n + v.costCents, 0);
    expect(spot!.costCents).toBe(variantCost);

    const total = spots.reduce((n, s) => n + s.costCents, 0);
    const paid = p.calls * 4;
    expect(total).toBe(paid);
  }, 180_000);

  it("stops a world that reaches its spending ceiling and asks for a human", async () => {
    // Retrying every spot until it is out of attempts is right when spots fail
    // one at a time and ruinous when the model is having a bad day: six rolls
    // across twenty-seven spots costs more than the world sells for.
    const p = painter(["nothing"], 250);
    const c = container(p);
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    expect(p.calls).toBe(3); // stopped at 7.50 USD against a 6.00 ceiling, not 18 rolls later
    const game = await gameOf(gameId);
    expect(game.status).toBe("MANUAL_REVIEW");
    expect(game.lastError).toContain("spending ceiling");

    // And it stays stopped: another tick must not quietly start spending again.
    await mod.runGenerationPipeline(c, gameId);
    expect(p.calls).toBe(3);
  }, 120_000);

  it("keeps the renders it rejected so a failing spot can be looked at", async () => {
    const c = container(painter(["nothing"]));
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    const spots = await spotsIn(gameId);
    const ids = JSON.parse(spots[0]!.variants[0]!.rejectedAssetIdsJson ?? "[]") as string[];
    expect(ids).toHaveLength(1);
    const kept = await db.asset.findUniqueOrThrow({ where: { id: ids[0]! } });
    expect(kept.type).toBe("REJECTED_PATCH");
    expect(kept.visibility).toBe("PRIVATE"); // a half-painted child is never shipped
  }, 120_000);

  it("a provider that throws is a retry, not a failed game", async () => {
    const c = container(painter(["throw"]));
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    expect((await job(gameId)).status).toBe("QUEUED");
    const game = await gameOf(gameId);
    expect(game.status).toBe("TARGETS_GENERATING");
    expect(game.lastError).toBeNull();
    const spots = await spotsIn(gameId);
    expect(spots[0]!.variants[0]!.lastError).toContain("provider exploded");
  }, 120_000);
});

describe("publishing", () => {
  it("a game that is ready stays ready when the email fails", async () => {
    const p = painter(["child"]);
    const c = container(p);
    // A mail server having a bad afternoon used to throw out of publishGame,
    // mark the job FAILED and put an email error in front of the parent.
    c.email = { id: "console", send: async () => { throw new Error("EROFS: read-only file system"); } } as never;
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    const { publishGame } = await import("../publish.service");
    const { SYSTEM } = await import("../audit.service");
    const result = await publishGame(c, gameId, SYSTEM);

    expect(result.playUrl).toContain("http");
    const game = await gameOf(gameId);
    expect(game.status).toBe("READY"); // ready, just not delivered
    expect(game.readyAt).not.toBeNull();
  }, 120_000);
});

/**
 * The payment webhook is a webhook, not a worker.
 *
 * It used to `await c.jobs.enqueue(...)` with a runner that calls the handler in
 * the calling request, so the PSP's socket was held open for the whole pipeline:
 * dozens of renders, judgements and retries. The parent was charged and then
 * waited on a request that could only time out — and a webhook the PSP gives up
 * on is a webhook it will redeliver.
 */
describe("the payment webhook", () => {
  it("marks the game paid and returns, without generating anything", async () => {
    const c = container(painter(["child"]));
    const gameId = await seedGame(c);
    await db.game.update({ where: { id: gameId }, data: { status: "CHECKOUT_PENDING", paidAt: null } });
    const game = await gameOf(gameId);
    const ownerId = game.ownerId;
    if (!ownerId) throw new Error("seeded game has no owner");
    const order = await db.order.create({
      data: { id: `ord_hook_${gameId}`, gameId, userId: ownerId, provider: "stub", packageTier: "ONE_WORLD", amountAgorot: 9900, currency: "ILS", paymentStatus: "PENDING" },
    });

    const paid = {
      ok: true as const,
      event: { orderId: order.id, providerEventId: `evt_${order.id}`, kind: "PAID" as const, amountAgorot: order.amountAgorot, providerPaymentId: "pay_1", raw: {} },
    };
    const withPayment = { ...c, payment: { id: "stub", parseWebhook: async () => paid } as never };

    const outcome = await mod.handlePaymentWebhook(withPayment, "{}", {});

    expect(outcome.status).toBe(200);
    expect((await gameOf(gameId)).status).toBe("PAID");
    // The thing that must NOT have happened: no hiding spot was even created,
    // let alone rendered. Generation is the queue's job, and the game row this
    // transaction wrote is what `nextPendingGame` selects on.
    expect(await spotsIn(gameId)).toHaveLength(0);
    expect(await db.generationJob.findUnique({ where: { id: `job_${gameId}` } })).toBeNull();

    // And the queue does pick it up from exactly that row.
    await mod.runGenerationPipeline(withPayment, gameId);
    expect((await spotsIn(gameId)).length).toBeGreaterThan(0);
  });
});

/**
 * "Deleting a game removes the photo and everything made from it. This cannot
 * be undone." That sentence is on the manage page, so it has to be true of the
 * whole graph.
 *
 * It was not. Deletion took the composed sprite per spot, and the avatar and
 * original photo when no other game needed them. It left the slot patches, the
 * renders QA rejected — kept deliberately, so a failing spot can be looked at —
 * and the identity sheet, which is the child drawn from several angles.
 */
describe("deleting a game", () => {
  it("leaves no picture of the child anywhere", async () => {
    const c = container(painter(["child"]));
    const gameId = await seedGame(c);
    await mod.runGenerationPipeline(c, gameId);

    const game = await gameOf(gameId);
    const childId = game.childProfileId;
    if (!childId) throw new Error("seeded game has no child");

    // The two things deletion used to miss. The identity sheet is whatever the
    // pipeline actually made — replacing it here would only orphan the real one
    // and test the replacement. The rejected render is added by hand because a
    // painter that always succeeds never produces one.
    const seeded = await db.childProfile.findUniqueOrThrow({ where: { id: childId } });
    expect(seeded.identityAssetId, "the pipeline should have drawn an identity sheet").toBeTruthy();
    const rejected = await mod.storeAsset(c, { ownerId: game.ownerId, type: "TARGET_SPRITE", visibility: "PRIVATE", buffer: await solid(64, 64, "#456"), mimeType: "image/png", width: 64, height: 64 });
    const [firstVariant] = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, take: 1 });
    if (!firstVariant) throw new Error("the pipeline produced no variants to delete");
    await db.targetVariantAsset.update({ where: { id: firstVariant.id }, data: { rejectedAssetIdsJson: JSON.stringify([rejected.id]) } });

    const before = await db.asset.count({ where: { ownerId: game.ownerId, status: { not: "DELETED" } } });
    expect(before).toBeGreaterThan(3);

    expect(await mod.deleteGame(c, gameId, mod.SYSTEM)).toBe(true);

    const live = await db.asset.findMany({ where: { ownerId: game.ownerId, status: { not: "DELETED" } }, select: { id: true, type: true } });
    expect(live, `still live: ${live.map((a) => `${a.type}:${a.id}`).join(", ")}`).toEqual([]);

    // And the rows no longer point at anything.
    const profile = await db.childProfile.findUniqueOrThrow({ where: { id: childId } });
    expect(profile.identityAssetId).toBeNull();
    expect(profile.originalPhotoAssetId).toBeNull();
    const variants = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
    expect(variants.every((v) => v.assetId === null && v.rejectedAssetIdsJson === null)).toBe(true);
  });
});


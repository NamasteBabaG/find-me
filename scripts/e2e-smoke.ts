/**
 * End-to-end smoke test against the real dev stack (SQLite, local storage,
 * mock providers). Walks the whole vertical slice without a browser:
 *
 *   draft → name → photo → package → worlds → checkout → webhook(PAID)
 *   → generation pipeline → (auto) publish → play link resolves → config is clean
 *
 * Usage:  npm run smoke   (see package.json)  — prints the play URL at the end.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// Tiny .env loader (no dotenv dependency): only sets keys that are not already set.
for (const line of readFileSync(path.resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/.exec(line);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").trim();
}
process.env.QA_AUTO_APPROVE = process.env.SMOKE_MANUAL_QA === "1" ? "false" : "true";

async function main() {
  const { getContainer } = await import("../src/services/container");
  const { createDraft, setChildName, attachPhoto, selectPackage, selectWorlds } = await import("../src/services/create-flow.service");
  const { startCheckout, handlePaymentWebhook } = await import("../src/services/order.service");
  const { MockPaymentProvider } = await import("../src/infra/payment/mock");
  const { resolvePlayToken, ensurePlayerLink } = await import("../src/services/share-link.service");
  const { parseGameConfig } = await import("../src/domain/game/config");
  const { statusOf } = await import("../src/services/game-status");

  const c = getContainer();
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[${String(Date.now() - t0).padStart(5)}ms] ${msg}`);
  const assert = (cond: unknown, msg: string) => {
    if (!cond) throw new Error(`ASSERT: ${msg}`);
  };

  const { gameId } = await createDraft(c, null, process.env.SMOKE_LOCALE === "he" ? "he" : "en");
  log(`draft ${gameId}`);
  assert((await setChildName(c, gameId, "נועה")).ok, "set name");

  const photo = readFileSync(path.resolve(process.cwd(), process.env.SMOKE_PHOTO ?? "storage/test/child.jpg"));
  const photoRes = await attachPhoto(c, gameId, { buffer: photo, mimeType: "image/jpeg", crop: { x: 0.2, y: 0.18, w: 0.6, h: 0.45 } });
  assert(photoRes.ok, `photo: ${!photoRes.ok ? photoRes.reason : ""}`);
  log("photo approved");

  const pkg = await selectPackage(c, gameId, "ONE_WORLD");
  assert(pkg.ok, `package: ${!pkg.ok ? pkg.reason : ""}`);
  const worlds = await selectWorlds(c, gameId, ["journey"]);
  assert(worlds.ok, `worlds: ${!worlds.ok ? worlds.reason : ""}`);
  log("package + world selected");

  const email = process.env.SMOKE_EMAIL ?? "smoke@example.com";
  const checkout = await startCheckout(c, { gameId, email });
  assert(checkout.ok, `checkout: ${!checkout.ok ? checkout.reason : ""}`);
  log(`checkout url ${checkout.ok ? checkout.checkoutUrl : ""}`);

  // Play the PSP: signed webhook through the real handler.
  const order = await c.db.order.findFirstOrThrow({ where: { gameId } });
  assert(c.payment instanceof MockPaymentProvider, "mock payment provider expected");
  const rawBody = JSON.stringify({ eventId: `evt_smoke_${order.id}`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot });
  const outcome = await handlePaymentWebhook(c, rawBody, { "x-mock-signature": (c.payment as InstanceType<typeof MockPaymentProvider>).sign(rawBody) });
  assert(outcome.status === 200, `webhook: ${outcome.body}`);
  const replay = await handlePaymentWebhook(c, rawBody, { "x-mock-signature": (c.payment as InstanceType<typeof MockPaymentProvider>).sign(rawBody) });
  assert(replay.body.includes("duplicate"), "webhook replay must be a no-op");
  log("webhook PAID (+ replay ignored)");

  // Wait for the in-process job.
  let status = "";
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    status = statusOf(await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } }));
    if (["READY", "DELIVERED", "QA_PENDING", "MANUAL_REVIEW", "GENERATION_FAILED", "NEEDS_NEW_PHOTO"].includes(status)) break;
  }
  log(`generation finished with status ${status}`);

  // The page nudges the queue on every poll and a cron nudges it too, so two
  // runners overlapping is normal. Without a lease each one saw "no avatar yet"
  // and drew its own — which billed a real customer three times on the first
  // live game. Running the pipeline twice at once must change nothing.
  const { runGenerationPipeline } = await import("../src/services/generation/pipeline");
  const before = new Date();
  await Promise.all([runGenerationPipeline(c, gameId), runGenerationPipeline(c, gameId), runGenerationPipeline(c, gameId)]);
  const newAssets = await c.db.asset.count({ where: { createdAt: { gte: before } } });
  const jobs = await c.db.generationJob.count({ where: { gameId } });
  assert(newAssets === 0, `concurrent runs created ${newAssets} assets, expected none`);
  assert(jobs === 1, `concurrent runs made ${jobs} job rows, expected 1`);
  log("concurrent pipeline runs are a no-op (no new assets, one job)");
  if (status === "GENERATION_FAILED") {
    const g = await c.db.game.findUniqueOrThrow({ where: { id: gameId } });
    throw new Error(`generation failed: ${g.lastError}`);
  }

  if (status === "QA_PENDING" || status === "MANUAL_REVIEW") {
    log("manual QA mode: approve in /admin/orders");
    return;
  }
  assert(status === "DELIVERED" || status === "READY", `expected READY/DELIVERED, got ${status}`);

  const link = await ensurePlayerLink(c, gameId);
  const resolved = await resolvePlayToken(c, link.token);
  assert(resolved.ok, "play token resolves");
  const config = parseGameConfig(resolved.ok ? (resolved.game.configJson as string) : "{}");
  assert(config.scenes.length === 9, "9 boards in config");
  assert(config.scenes.every((s) => s.targets.length === 3), "3 missions per board");
  assert(!JSON.stringify(config).includes("private/"), "config must not reference private storage");

  const child = await c.db.childProfile.findFirstOrThrow({ where: { games: { some: { id: gameId } } } });
  assert(child.originalPhotoAssetId === null, "original photo deleted after approval");
  assert(child.avatarAssetId, "avatar exists");

  const bad = await resolvePlayToken(c, `${link.token.slice(0, -3)}xyz`);
  assert(!bad.ok, "tampered token rejected");

  log(`✅ vertical slice OK — play: ${link.url}`);
  log(`   library magic link is in storage/outbox (or /dev/outbox) for ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌", err);
    process.exit(1);
  });

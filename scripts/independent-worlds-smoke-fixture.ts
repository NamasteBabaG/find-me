/** Local-only synthetic browser fixture. Never reads a real child's photo or a live database. */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { applyTestSchema } from "../src/lib/test-schema";
import { DbStorage } from "../src/infra/storage/db";
import { createDraft, setChildName, attachPhoto, selectPackage } from "../src/services/create-flow.service";
import type { Container } from "../src/services/container";

async function main() {
  if (process.env.APP_ENV !== "development" || process.env.GENERATION_PROVIDER !== "mock" || process.env.PAYMENT_PROVIDER !== "mock") throw new Error("Explicit development + mock providers required");
  const scratch = await mkdtemp(path.join(tmpdir(), "findme-independent-browser-"));
  const databaseUrl = `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}`;
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await applyTestSchema(db);
    const c = { db, storage: new DbStorage(db), analytics: { track() {} } } as unknown as Container;
    const draft = await createDraft(c, null, "he");
    await setChildName(c, draft.gameId, "בדיקת הרפתקה", 5);
    const photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#7ac9d0" } }).png().toBuffer();
    const photoResult = await attachPhoto(c, draft.gameId, { buffer: photo, mimeType: "image/png", crop: null });
    if (!photoResult.ok) throw new Error(photoResult.code);
    const result = await selectPackage(c, draft.gameId, "ONE_WORLD");
    if (!result.ok) throw new Error(result.code);
    const output = path.resolve("output/independent-worlds-smoke");
    await mkdir(output, { recursive: true });
    const metadata = { ...draft, databaseUrl, synthetic: true, providers: "mock", url: "http://localhost:3034/create/scenes" };
    await writeFile(path.join(output, "fixture.json"), JSON.stringify(metadata, null, 2));
    console.log(JSON.stringify(metadata));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

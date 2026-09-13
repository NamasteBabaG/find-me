import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../../../infra/db/prisma-retained-purchase-store";
import { localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { localPatchRecoveryDirectiveForHide, type LocalPatchRecoveryDirective } from "../../../domain/scene/local-patch-recovery-directive";
import { buyLocalPatch, LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, localPatchImagePolicyForVersion, localPatchRenderPolicySha256 } from "../../../infra/generation/openai-local-patch";
import { LOCAL_PATCH_AGE_PROMPT_VERSION, localPatchPrompt, type LocalPatchPromptInput } from "../local-patch-prompt";
import { RETAINED_RENDER_VERSION, poseMask, renderLocalPatchHide, type LocalPatchAttemptInput, type LocalPatchRenderDeps } from "../local-patch-render";
import { WorldBudget } from "../world-budget";

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
// Captured from the unchanged paid recipe BEFORE adding this optional feature.
const BASELINE = {
  amazon: "28e1880dee1f56f44ea3b9124af74d8bc3a736437e20581e2e9bcd5734830a5f",
  sydney: "d72a1f0b340d1013451272b6694e0a7fc60a6ec4d126c598b67b7be10446be15",
  greatwall: "96169912d4e576505d09b6e57bfbf850173db1eda031409f72b5c48cb5f44381",
};
type Site = keyof typeof BASELINE;
function authored(site: Site) {
  const board = localPatchBoardForVersion(site, 9)!;
  const hide = board.hides[4]!;
  const promptInput: LocalPatchPromptInput = { contentVersion: 9, hideId: hide.id, ground: board.ground, pose: hide.pose,
    ageYears: 5, wardrobe: board.wardrobe, placement: hide.placement, mask: maskForHide(hide) };
  return { board, hide, promptInput, directive: localPatchRecoveryDirectiveForHide(hide.id)! };
}

describe("recovery changes only the authorised question", () => {
  it.each(Object.keys(BASELINE) as Site[])("keeps the ordinary paid %s question byte-identical", site => {
    const { promptInput } = authored(site);
    expect(sha(localPatchPrompt(promptInput))).toBe(BASELINE[site]);
    expect(sha(localPatchPrompt({ ...promptInput, recoveryDirective: undefined }))).toBe(BASELINE[site]);
  });
  it.each(Object.keys(BASELINE) as Site[])("changes the %s question without extra references or bystander-replacement permission", site => {
    const { promptInput, directive } = authored(site);
    const prompt = localPatchPrompt({ ...promptInput, recoveryDirective: directive });
    expect(sha(prompt)).not.toBe(BASELINE[site]);
    expect(prompt).toContain("There are only two images");
    expect(prompt).toContain("FACE AND HAIR AUTHORITY: Image 2 only");
    expect(prompt).toContain("do NOT replace any bystander");
    expect(prompt).not.toContain("or replace a bystander");
    expect(prompt).not.toContain("Their head and one shoulder are what a reader finds first");
    expect(prompt).toContain("PARENT-CONFIRMED TARGET AGE: 5 years old");
    expect(prompt).toContain("REASON:");
  });
  it("asks for visible Amazon age evidence, not a larger head or removal of the lower-body occluder", () => {
    const { promptInput, directive } = authored("amazon");
    const prompt = localPatchPrompt({ ...promptInput, recoveryDirective: directive });
    for (const fragment of ["BOTH small preschool shoulders", "upper torso", "forearm/hand", "legs naturally concealed", "Do not enlarge the head"]) {
      expect(prompt).toContain(fragment);
    }
  });
  it.each([6, 7, 8, undefined])("refuses a recovery directive on old content %s", contentVersion => {
    const { promptInput, directive } = authored("sydney");
    expect(() => localPatchPrompt({ ...promptInput, contentVersion, recoveryDirective: directive })).toThrow(/only to the v9/);
  });
});

let scratch: string, url: string, db: PrismaClient, boardPng: Buffer, portrait: Buffer;
const clients: PrismaClient[] = [];
function client() { const result = new PrismaClient({ datasources: { db: { url } } }); clients.push(result); return result; }
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-site-recovery-")));
  url = `file:${path.join(scratch, "synthetic.sqlite").replace(/\\/g, "/")}`;
  db = client(); await applyTestSchema(db);
  boardPng = await sharp({ create: { width: 3072, height: 2048, channels: 4, background: "#d2be96" } }).png().toBuffer();
  portrait = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#b2b4ce" } }).png().toBuffer();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("A live provider must never run in recovery-directive tests"); }));
}, 60_000);
afterAll(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all(clients.map(c => c.$disconnect()));
  if (scratch && path.dirname(realpathSync(scratch)) === realpathSync(tmpdir()) && path.basename(scratch).startsWith("findme-site-recovery-")) {
    rmSync(scratch, { recursive: true, force: true });
  }
});

function input(site: Site, attempt = 3): LocalPatchAttemptInput {
  const { board, hide } = authored(site);
  return { contentVersion: 9, worldId: `synthetic-recovery-${site}`, board, hide, composedPng: boardPng,
    identityPng: portrait, judgeIdentityPng: portrait, referenceMode: LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE,
    ageYears: 5, attempt, apiKey: "synthetic-no-network" };
}
function worker(connection = db) {
  const ledger = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(connection)));
  const store = new PrismaRetainedPurchaseStore(connection);
  return { ledger, store };
}

describe("real purchase boundary with a synthetic image wire", () => {
  it.each(["amazon-peek-age-evidence-v1", "arbitrary instructions"])("rejects mismatched %s before ledger/store reads and dispatch", code => {
    const w = worker();
    const reads = vi.spyOn(w.ledger, "readRequest"), reserves = vi.spyOn(w.ledger, "reserve"), gets = vi.spyOn(w.store, "get");
    const render = vi.fn<LocalPatchRenderDeps["render"]>(async () => { throw new Error("must not dispatch"); });
    return expect(renderLocalPatchHide({ ...w, render, renderPolicySha256: "test-policy" },
      { ...input("sydney"), recoveryDirective: code as LocalPatchRecoveryDirective })).rejects.toThrow(/does not match/).then(() => {
      expect(reads).not.toHaveBeenCalled(); expect(reserves).not.toHaveBeenCalled(); expect(gets).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled();
    });
  });

  it.each(Object.keys(BASELINE) as Site[])("retains %s attempt 3 unchanged, buys the distinct conditioned attempt once, and replays from fresh SQLite adapters", async site => {
    const ordinary = input(site), { directive } = authored(site), policy = localPatchImagePolicyForVersion(9);
    const w = worker();
    let responses = 0;
    const wire = vi.fn<typeof fetch>(async (_url, init) => {
      const form = init!.body as FormData;
      const images = form.getAll("image[]") as Blob[];
      expect(images).toHaveLength(2);
      expect(Buffer.from(await images[1]!.arrayBuffer()).equals(portrait)).toBe(true);
      expect(form.get("quality")).toBe("low"); expect(form.get("model")).toBe("gpt-image-2");
      expect(form.get("size")).toBe("768x1152");
      const before = Buffer.from(await images[0]!.arrayBuffer());
      const mask = Buffer.from(await (form.get("mask") as Blob).arrayBuffer());
      expect(mask.equals(await poseMask(ordinary.hide))).toBe(true);
      const box = maskForHide(ordinary.hide);
      const child = await sharp({ create: { width: 36, height: 64, channels: 4, background: "#304080" } }).png().toBuffer();
      const painted = await sharp(before).composite([{ input: child, left: box.left + 20, top: box.top + 20 }])
        .resize(768, 1152, { kernel: "nearest" }).png().toBuffer();
      return new Response(JSON.stringify({ model: "gpt-image-2",
        usage: { input_tokens: 30, output_tokens: 196, total_tokens: 226, input_tokens_details: { text_tokens: 10, image_tokens: 20 } },
        data: [{ b64_json: painted.toString("base64") }] }), { status: 200, headers: { "x-request-id": `req-synthetic-${site}-${++responses}` } });
    });
    const render = vi.fn<LocalPatchRenderDeps["render"]>(request => buyLocalPatch("synthetic-no-network", request, { policy, fetchOnce: wire }));
    const judge = vi.fn(async () => { throw new Error("v9 waits for the existing grouped review, not a new judge chain"); });
    const deps = { ...w, render, judge, renderPolicySha256: localPatchRenderPolicySha256(policy) };
    const first = await renderLocalPatchHide(deps, ordinary);
    expect({ accepted: first.accepted, stopped: first.stoppedReason, renderFault: first.renderFault }).toEqual({ accepted: true, stopped: null, renderFault: null });
    const key3 = `${ordinary.hide.id}:${ordinary.hide.pose}:render:3`;
    const oldBill = await w.ledger.readRequest(ordinary.worldId, key3);
    const oldBytes = await w.store.get(ordinary.worldId, key3);
    const style = await sharp(boardPng).extract(cropOf(ordinary.hide)).png().toBuffer();
    const oldFingerprint = sha(JSON.stringify({ version: LOCAL_PATCH_AGE_PROMPT_VERSION, hide: ordinary.hide.id,
      pose: ordinary.hide.pose, crop: cropOf(ordinary.hide), prompt: BASELINE[site], style: sha(style), identity: sha(portrait),
      mask: sha(await poseMask(ordinary.hide)), referenceMode: LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE,
      composition: "bounded-return/v1", policy: deps.renderPolicySha256, retained: RETAINED_RENDER_VERSION }));
    expect(oldBill?.operationFingerprint).toBe(oldFingerprint);
    const conflict = await renderLocalPatchHide(deps, { ...ordinary, recoveryDirective: directive });
    expect(conflict).toMatchObject({ accepted: false, refusedBecause: "stopped" });
    expect(conflict.stoppedReason).toMatch(/different operation.*inputs changed/i);
    expect(wire).toHaveBeenCalledTimes(1);
    const extra = { ...ordinary, attempt: 4, recoveryDirective: directive };
    expect((await renderLocalPatchHide(deps, extra)).accepted).toBe(true);
    expect(wire).toHaveBeenCalledTimes(2);
    const finalBill = await w.ledger.readRequest(ordinary.worldId, `${ordinary.hide.id}:${ordinary.hide.pose}:render:4`);
    expect(finalBill?.state).toBe("settled");
    expect(finalBill?.operationFingerprint).not.toBe(oldFingerprint);
    const replay = await renderLocalPatchHide({ ...deps, ...worker(client()) }, extra);
    expect(replay.accepted).toBe(true); expect(wire).toHaveBeenCalledTimes(2); expect(judge).not.toHaveBeenCalled();
    expect(await w.ledger.readRequest(ordinary.worldId, key3)).toEqual(oldBill);
    expect((await w.store.get(ordinary.worldId, key3))?.bytes.equals(oldBytes!.bytes)).toBe(true);
    expect((await w.ledger.audit(ordinary.worldId)).settledMicroUsd).toBe(12_180);
    expect((await w.ledger.audit(ordinary.worldId)).byScope.judge.settledMicroUsd).toBe(0);
    const prompts = wire.mock.calls.map(([, init]) => String((init!.body as FormData).get("prompt")));
    expect(prompts[0]).not.toContain("SITE RECOVERY"); expect(prompts[1]).toContain(directive);
  }, 60_000);
});

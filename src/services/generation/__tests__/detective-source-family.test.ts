import type { Prisma } from "@prisma/client";
import { pinDetectiveSourceScope, sealDetectiveSourceFamily } from '../source-family-scope';
import { pinJourneyWindowRelease, journeyWindowReleaseOf, journeyWindowReleaseId } from '../journey-window-release';
import { DETECTIVES_OPERATIONAL_RELEASE } from '../../../domain/generation/detectives-operational-policy';
import { JOURNEY_WINDOW_RELEASE, JOURNEY_WINDOW_MANIFEST, JOURNEY_WINDOW_BODY_SHA256 } from '../../../../content/detectives/journey-window-release-v1';
import { SOURCE_BODY_REPAIR_MANIFEST_SHA256 } from '../../../../content/detectives/source-body-repair';
import { sourceBodyForHide, sourcePlacementManifestForHide } from '../source-placement-release';
import { crownTabAuthorityFor } from '../../../domain/generation/crown-tab';
import { cropOf, maskForHide } from '../../../domain/scene/local-patch-hides';
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DETECTIVE_PATCH_BOARDS } from "../../../../content/detectives/runtime-release";
import { KINGDOM_DETECTIVE_PATCH_BOARDS } from '../../../../content/detectives/kingdom/runtime-release';
import { DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 } from "../../../../content/detectives/source-placement-release";
import { SOURCE_PLACEMENT_POLICY_ACTION, sourcePlacementCanonical } from "../../../domain/scene/source-placement-release";
import { leanReleaseAuditId, leanReleaseReceipt, LOCAL_PATCH_LEAN_ACTION } from "../lean-release";
import { pinVisualReviewRelease, DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { identitySourceAuditId, pinIdentitySourceRelease } from "../identity-source-release";
import { assertTrustedSourcePlacementContext, localPatchSourceSelectionAllowed, pinLocalPatchSourceFamily,
  pinSourcePlacementRelease, resolveLocalPatchBoardsForGame, sourceFamilyAuditId, sourcePlacementForHide,
  sourcePlacementReleaseAuditId, sourcePlacementReleaseOf } from "../source-placement-release";

const configuration = vi.hoisted(() => ({ APP_ENV: "qa", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" }));
vi.mock("../../../lib/env", () => ({ env: () => configuration }));
beforeEach(() => { configuration.APP_ENV = "qa"; configuration.LOCAL_PATCH_PROMPT_RELEASE = "v19"; configuration.LOCAL_PATCH_IDENTITY_SOURCE = "full-source-v1"; });

type Row = { id: string; actorType: string; actorId: string | null; action: string; entityType: string; entityId: string; metaJson: string | null };
function database() {
  const rows = new Map<string, Row>();
  const state = { game: { id: "game_synthetic_detective_family", status: "DRAFT", styleVersion: "local-patch-world-v1", searchLevel: "detectives",
    deletedAt: null, readyAt: null, configJson: null, paidAt: null, ownerId:'owner_synthetic',
    childProfile:null as null|{ownerId:string;deletedAt:null;originalPhotoAssetId:string|null;identityAssetId:null;avatarAssetId:null},
    scenes: DETECTIVE_PATCH_BOARDS.map((board, orderIndex) => ({ sceneSlug: board.board, sceneVersion: 13, orderIndex })) },
    order: false, job: false, attempt: false };
  const db = {
    auditLog: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<Row, "actorId"> & { actorId?: string | null } }) => {
        const row = { actorId: null, ...data }; if (rows.has(row.id)) throw Error("synthetic duplicate audit"); rows.set(row.id, row); return row;
      }),
      upsert: vi.fn(async ({ where, create }: { where: { id: string }; create: Omit<Row, "actorId"> }) => {
        if (!rows.has(where.id)) rows.set(where.id, { actorId: null, ...create }); return rows.get(where.id)!;
      }),
    },
    game: { findUniqueOrThrow: vi.fn(async () => state.game), findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === state.game.id ? state.game : null) },
    order: { findFirst: vi.fn(async () => state.order ? { id: "synthetic-order" } : null) },
    generationJob: { findFirst: vi.fn(async () => state.job ? { id: "synthetic-job" } : null) },
    targetVariantAsset: { findFirst: vi.fn(async () => state.attempt ? { id: "synthetic-attempt" } : null) },
    worldBudgetLedger:{findUnique:vi.fn(async()=>null)},
  };
  return { rows, state, tx: db as unknown as Prisma.TransactionClient };
}
async function basePins(f: ReturnType<typeof database>) {
  const gameId = f.state.game.id;
  f.rows.set(leanReleaseAuditId(gameId), { id: leanReleaseAuditId(gameId), actorType: "SYSTEM", actorId: null,
    action: LOCAL_PATCH_LEAN_ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(leanReleaseReceipt(gameId)) });
  await pinVisualReviewRelease(f.tx, gameId, DUAL_VISUAL_REVIEW_V3);
  await pinIdentitySourceRelease(f.tx, gameId);
}
async function enrolled() {
  const f = database(); await basePins(f);
  await pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 13, searchLevel: "detectives" });
  return f;
}

async function scopedWindows(enabled:boolean,kingdom=false){const f=database();await basePins(f);
  if(kingdom)f.state.game.scenes=KINGDOM_DETECTIVE_PATCH_BOARDS.map((b,orderIndex)=>({sceneSlug:b.board,sceneVersion:13,orderIndex}));
  await pinDetectiveSourceScope(f.tx,f.state.game.id,DETECTIVES_OPERATIONAL_RELEASE,'db');
  await pinJourneyWindowRelease(f.tx,f.state.game.id,enabled?JOURNEY_WINDOW_RELEASE:undefined);
  f.state.game.status='PACKAGE_SELECTED';f.state.game.childProfile={ownerId:f.state.game.ownerId,deletedAt:null,originalPhotoAssetId:'synthetic-photo',identityAssetId:null,avatarAssetId:null};
  await sealDetectiveSourceFamily(f.tx,f.state.game.id);return f;
}
describe('prospective Journey windows preserve old games and ordinary quality',()=>{
  it('does not transfer Journey permissions to a Kingdom selected from the same pre-photo scope',async()=>{
    const a=await scopedWindows(false,true),b=await scopedWindows(true,true);
    const old=await resolveLocalPatchBoardsForGame(a.tx,a.state.game.id,13),fresh=await resolveLocalPatchBoardsForGame(b.tx,b.state.game.id,13);
    expect(fresh.boards).toEqual(old.boards);expect(fresh.boards.flatMap(b=>b.hides)).toHaveLength(27);
    for(const board of fresh.boards)for(const hide of board.hides){expect(sourceBodyForHide(fresh,hide.id)).toBeNull();
      expect(sourcePlacementManifestForHide(fresh,hide.id)).toBe(fresh.manifestSha256);}
  });
  it('resolves all27; only the three authorized windows change, with complete source heads and body coverage',async()=>{
    const old=await scopedWindows(false),fresh=await scopedWindows(true),a=await resolveLocalPatchBoardsForGame(old.tx,old.state.game.id,13),b=await resolveLocalPatchBoardsForGame(fresh.tx,fresh.state.game.id,13);
    expect(b.boards.flatMap(b=>b.hides)).toHaveLength(27);expect(await journeyWindowReleaseOf(old.tx,old.state.game.id)).toBeNull();
    const changed:string[]=[];
    for(const board of a.boards)for(const h of board.hides){const next=b.boards.find(b=>b.board===board.board)!.hides.find(n=>n.id===h.id)!;
      if(JSON.stringify(h)!==JSON.stringify(next))changed.push(h.id);
      expect({...next,returnRect:h.returnRect,wardrobe:h.wardrobe}).toEqual(h); // identity/pose/scale/support/envelope unchanged
      const change=JOURNEY_WINDOW_MANIFEST.entries.find(e=>e.hideId===h.id);
      expect(next.returnRect).toEqual(change?.returned??h.returnRect);
      if(change){const entry=sourcePlacementForHide(b,h.id)!;
        expect(entry.effective.returnRect).toEqual(next.returnRect);expect(entry.sourceNeighbors!.contract.returnRect).toEqual(next.returnRect);
        expect(sourcePlacementManifestForHide(b,h.id)).not.toBe(sourcePlacementManifestForHide(a,h.id));
        // An old crown-tab authority cannot be transplanted to the new geometry.
        expect(crownTabAuthorityFor({hideId:h.id,sourceSha256:entry.source.sha256,crop:cropOf(next),child:maskForHide(next),returned:next.returnRect!})).toBeNull();
      }
    }
    expect(changed.sort()).toEqual(JOURNEY_WINDOW_MANIFEST.entries.map(e=>e.hideId).sort());
    expect(sourceBodyForHide(a,'giza-detectives-hide-2')!.returnRect.top).toBe(208);
    expect(sourceBodyForHide(b,'giza-detectives-hide-2')!.returnRect.top).toBe(150);
    const wardrobe=b.boards.find(b=>b.board==='giza')!.hides.find(h=>h.id==='giza-detectives-hide-2')!.wardrobe!;
    expect(wardrobe).toContain('playing with the wooden hoop');expect(wardrobe).not.toContain('listening to the drum');
    expect(sourcePlacementManifestForHide(a,'giza-detectives-hide-2')).toBe(SOURCE_BODY_REPAIR_MANIFEST_SHA256);
    expect(sourcePlacementManifestForHide(b,'giza-detectives-hide-2')).toBe(JOURNEY_WINDOW_BODY_SHA256);
    // Re-resolving a historical game after a new game cannot mutate its bytes.
    expect((await resolveLocalPatchBoardsForGame(old.tx,old.state.game.id,13)).boards).toEqual(a.boards);
    expect(()=>sourcePlacementForHide({...b},'giza-detectives-hide-2')).toThrow('untrusted');
  });
  it.each(['photo','paid','order','job','sealed'])('refuses after %s instead of migrating an old game',async fault=>{
    const f=database();await basePins(f);await pinDetectiveSourceScope(f.tx,f.state.game.id,DETECTIVES_OPERATIONAL_RELEASE,'db');
    if(fault==='photo')f.state.game.childProfile={ownerId:f.state.game.ownerId,deletedAt:null,originalPhotoAssetId:'synthetic-photo',identityAssetId:null,avatarAssetId:null};
    if(fault==='paid')f.state.game.paidAt='synthetic-paid' as unknown as null;
    if(fault==='order')f.state.order=true;if(fault==='job')f.state.job=true;if(fault==='sealed')f.state.game.status='PACKAGE_SELECTED';
    await expect(pinJourneyWindowRelease(f.tx,f.state.game.id,JOURNEY_WINDOW_RELEASE)).rejects.toThrow('JOURNEY_WINDOWS');
    expect(f.rows.has(journeyWindowReleaseId(f.state.game.id))).toBe(false);
  });
  it.each(['actor','hash','bytes','scope'])('fails closed for a changed %s',async fault=>{
    const f=await scopedWindows(true),row=f.rows.get(journeyWindowReleaseId(f.state.game.id))!;
    if(fault==='actor')row.actorId='foreign';else if(fault==='bytes')row.metaJson+=' ';
    else{const p=JSON.parse(row.metaJson!);p[fault==='hash'?'manifestSha256':'scopeSha256']='f'.repeat(64);row.metaJson=JSON.stringify(p);}
    await expect(resolveLocalPatchBoardsForGame(f.tx,f.state.game.id,13)).rejects.toThrow();
  });
});

describe("immutable Detective source-family receipts", () => {
  it("binds all27 measured placements and exact original base policy bytes, without a v12 companion", async () => {
    const f = await enrolled(), pin = await sourcePlacementReleaseOf(f.tx, f.state.game.id);
    if (!pin || pin.baseSceneVersion !== 13) throw Error("expected separately pinned Detective family");
    expect(pin).toMatchObject({ familyId: "journey-detectives/v1", searchLevel: "detectives", worldSlug: "journey",
      manifestSha256: DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 });
    expect(pin.coverage).toHaveLength(27);
    expect(new Set(pin.coverage.map(e => e.hideId)).size).toBe(27);
    expect(f.rows.has(sourcePlacementReleaseAuditId(f.state.game.id))).toBe(false);
    const before = [...f.rows.values()].map(row => [row.id, row.metaJson]);
    await pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 13, searchLevel: "detectives" });
    expect([...f.rows.values()].map(row => [row.id, row.metaJson])).toEqual(before);
  });
  it("refuses13 without its family and refuses a different requested level/version before writing", async () => {
    const f = database(); await basePins(f);
    await expect(resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 13)).rejects.toThrow("exact family pin");
    await expect(pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 12, searchLevel: "detectives" })).rejects.toThrow("selected level differ");
    await expect(pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 13, searchLevel: "explorers" })).rejects.toThrow("selected level differ");
    expect(f.tx.auditLog.upsert).not.toHaveBeenCalled();
  });
  it.each(["order", "job", "attempt"] as const)("refuses prospective enrollment after an existing %s", async field => {
    const f = database(); await basePins(f); f.state[field] = true;
    await expect(pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 13, searchLevel: "detectives" })).rejects.toThrow("prospective Detective family");
    expect(f.rows.has(sourceFamilyAuditId(f.state.game.id))).toBe(false);
  });
  it.each(["PAID", "TARGETS_GENERATING", "READY", "DELIVERED"])("does not enroll a %s game", async status => {
    const f = database(); await basePins(f); f.state.game.status = status;
    await expect(pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 13, searchLevel: "detectives" })).rejects.toThrow("unstarted Detective");
  });
  it("authenticates the separate identity-source base pin, including its exact bytes", async () => {
    const f = database(); await basePins(f); f.rows.delete(identitySourceAuditId(f.state.game.id));
    await expect(pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 13, searchLevel: "detectives" })).rejects.toThrow("full-source identity pin");
    await pinIdentitySourceRelease(f.tx, f.state.game.id);
    f.rows.get(identitySourceAuditId(f.state.game.id))!.metaJson += " ";
    await expect(pinLocalPatchSourceFamily(f.tx, f.state.game.id, { sceneVersion: 13, searchLevel: "detectives" })).rejects.toThrow("identity source release is invalid");
  });
  it.each(["manifestSha256", "sourceInputSha256", "runtimeCatalogSha256", "identityStyleSha256", "leanPinSha256", "dualPinSha256", "identityPinSha256", "compositeQualificationSha256"])("never substitutes another %s", async field => {
    const f = await enrolled(), row = f.rows.get(sourceFamilyAuditId(f.state.game.id))!, pin = JSON.parse(row.metaJson!);
    pin[field] = "f".repeat(64); row.metaJson = sourcePlacementCanonical(pin);
    await expect(sourcePlacementReleaseOf(f.tx, f.state.game.id)).rejects.toThrow("original qualified release");
  });
  it("rejects dual-family rows and direct old-companion enrollment under a Detective game", async () => {
    const f = await enrolled();
    await expect(pinSourcePlacementRelease(f.tx, f.state.game.id)).rejects.toThrow("Detective family cannot gain");
    f.rows.set(sourcePlacementReleaseAuditId(f.state.game.id), { id: sourcePlacementReleaseAuditId(f.state.game.id), actorType: "SYSTEM", actorId: null,
      action: SOURCE_PLACEMENT_POLICY_ACTION, entityType: "Game", entityId: f.state.game.id, metaJson: "{}" });
    await expect(sourcePlacementReleaseOf(f.tx, f.state.game.id)).rejects.toThrow("two source families");
  });
});

describe("authoritative13 source context", () => {
  it("loads all27 exact Detective contracts and refuses forged transferable context", async () => {
    const f = await enrolled(), context = await resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 13);
    expect(context.boards).toHaveLength(9); expect(context.boards.flatMap(b => b.hides)).toHaveLength(27);
    expect(context.boards.every(b => b.art.includes("-detectives-"))).toBe(true);
    vi.mocked(f.tx.auditLog.findUnique).mockClear();
    for (const board of context.boards) for (const hide of board.hides) expect(sourcePlacementForHide(context, hide.id)).toMatchObject({ sceneVersion: 13, boardId: board.board });
    expect(f.tx.auditLog.findUnique).not.toHaveBeenCalled();
    expect(() => assertTrustedSourcePlacementContext({ ...context })).toThrow("untrusted");
  });
  it.each(["level", "version", "foreign-board", "omitted", "duplicate"])("refuses a mismatched game %s", async fault => {
    const f = await enrolled();
    if (fault === "level") f.state.game.searchLevel = "explorers";
    if (fault === "version") f.state.game.scenes[0]!.sceneVersion = 12;
    if (fault === "foreign-board") f.state.game.scenes[0]!.sceneSlug = "castlegate";
    if (fault === "omitted") f.state.game.scenes.pop();
    if (fault === "duplicate") f.state.game.scenes[8] = { ...f.state.game.scenes[0]! };
    await expect(resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 13)).rejects.toThrow("exact whole pinned family");
  });
  it("keeps matching pins readable after sales withdrawal but refuses cross-family level/scene selection", async () => {
    const f = await enrolled(); configuration.LOCAL_PATCH_IDENTITY_SOURCE = "legacy";
    expect((await sourcePlacementReleaseOf(f.tx, f.state.game.id))?.baseSceneVersion).toBe(13);
    expect(await localPatchSourceSelectionAllowed(f.tx, f.state.game, "detectives", f.state.game.scenes)).toBe(true);
    expect(await localPatchSourceSelectionAllowed(f.tx, f.state.game, "explorers")).toBe(false);
    expect(await localPatchSourceSelectionAllowed(f.tx, f.state.game, "detectives", [{ sceneSlug: "castlegate", sceneVersion: 13 }])).toBe(false);
    await expect(resolveLocalPatchBoardsForGame(f.tx, f.state.game.id, 12)).rejects.toThrow("another scene version");
  });
});

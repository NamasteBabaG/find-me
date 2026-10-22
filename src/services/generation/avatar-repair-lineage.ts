import type { Asset, Prisma } from "@prisma/client";
import { z } from "zod";

/** Durable deletion addresses for display-only avatar replacements. */
export const AVATAR_REPAIR_LINEAGE_ACTION = "avatar:display-repair-assets/v1";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const lineage = z.object({
  version: z.literal(AVATAR_REPAIR_LINEAGE_ACTION), childId: id, ownerId: id,
  identityAssetId: id, sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  previousAvatarId: id.nullable(), avatarId: id, gameIds: z.array(id).min(1),
}).strict().refine(record => record.previousAvatarId !== record.avatarId
  && new Set(record.gameIds).size === record.gameIds.length, "Invalid display repair addresses");
type LineageDb = Pick<Prisma.TransactionClient, "auditLog" | "asset">;
type Binding = { childId: string; ownerId: string | null };
function demand(ok: unknown): asserts ok { if (!ok) throw Error("Invalid display repair inventory"); }

/** No records is a no-op for historical engines. These are child-level addresses:
 * the last game may be a legacy sibling rather than the game that initiated the recut. */
export async function avatarRepairLineageAssets(db: LineageDb, binding: Binding): Promise<Asset[]> {
  const rows = await db.auditLog.findMany({ where: { action: AVATAR_REPAIR_LINEAGE_ACTION,
    entityType: "ChildProfile", entityId: binding.childId } });
  if (!rows.length) return [];
  const ids = new Set<string>();
  for (const row of rows) {
    let value: unknown;
    try { value = JSON.parse(row.metaJson ?? "null"); } catch { demand(false); }
    const parsed = lineage.safeParse(value);
    demand(parsed.success && row.actorType === "SYSTEM" && row.actorId === null);
    const record = parsed.data;
    demand(record.childId === binding.childId && record.ownerId === binding.ownerId);
    ids.add(record.avatarId);
    if (record.previousAvatarId) ids.add(record.previousAvatarId);
  }
  const assets = await db.asset.findMany({ where: { id: { in: [...ids] } } });
  demand(assets.length === ids.size && assets.every(asset => asset.ownerId === binding.ownerId
    && asset.type === "AVATAR" && asset.visibility === "GAME"));
  return assets;
}

/** Called inside the deleting game's existing serializable lifecycle fence.
 * Only these DB-backed derivatives are added to older deletion routes; their
 * ordinary image graph, contracts and accounting retain their existing paths. */
export async function purgeAvatarRepairLineage(tx: Prisma.TransactionClient,
  input: Binding & { gameId: string; now: Date }): Promise<void> {
  const assets = await avatarRepairLineageAssets(tx, input);
  if (!assets.length) return;
  const game = await tx.game.findUnique({ where: { id: input.gameId } });
  const child = await tx.childProfile.findUnique({ where: { id: input.childId } });
  demand(game && child && game.ownerId === input.ownerId && child.ownerId === input.ownerId
    && game.childProfileId === input.childId);
  if (await tx.game.count({ where: { childProfileId: input.childId, deletedAt: null, NOT: { id: input.gameId } } })) return;
  for (const asset of assets) {
    const aliases = await tx.asset.findMany({ where: { storagePath: asset.storagePath }, select: { id: true } });
    const aliasIds = aliases.map(alias => alias.id);
    if (aliases.length !== 1
      || await tx.childProfile.count({ where: { NOT: { id: input.childId }, OR: [
        { originalPhotoAssetId: { in: aliasIds } }, { identityAssetId: { in: aliasIds } }, { avatarAssetId: { in: aliasIds } },
      ] } })
      || await tx.targetInstance.count({ where: { gameScene: { gameId: { not: input.gameId }, game: { deletedAt: null } }, spriteAssetId: { in: aliasIds } } })
      || await tx.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId: { not: input.gameId }, game: { deletedAt: null } } }, assetId: { in: aliasIds } } })) continue;
    await tx.fileBlob.deleteMany({ where: { key: asset.storagePath } });
    await tx.asset.update({ where: { id: asset.id }, data: { status: "DELETED", deletedAt: input.now } });
  }
}

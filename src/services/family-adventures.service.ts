import { emptyAdventureProgress, readAdventureProgress } from "@/domain/adventure/progress";
import { summarizeWorlds, type WorldSummary } from "@/domain/adventure/summary";
import { parseGameConfig, type GameConfig } from "@/domain/game/config";
import { signedAssetUrl, withFreshAssetUrls } from "./asset.service";
import type { Container } from "./container";
import { familyOverview } from "./family.service";

const PLAYABLE = ["READY", "DELIVERED"];

export type FamilyAdventure = {
  gameId: string;
  /** The game's own title, for when its maps can't be read. */
  title: string | null;
  /** Playable from the family area; otherwise it is still being made. */
  ready: boolean;
  /** Each world of the game with the child's progress. Empty while it is being made, or if its content can't be read. */
  worlds: WorldSummary[];
  /** The account keeps this game's progress. False for older formats, whose progress stays in the child's browser. */
  tracked: boolean;
};

export type FamilyChild = { id: string; name: string; avatarUrl: string | null; adventures: FamilyAdventure[] };

/**
 * The family area's view of each child: the illustrated sticker the child plays as, and every paid adventure
 * with its maps and progress. Owner-fenced by `familyOverview`. The sticker is a GAME asset, signed like the
 * game's own config, so the browser may keep it instead of asking again on every visit.
 */
export async function familyAdventures(c: Pick<Container, "db" | "secret">, ownerId: string, childId?: string): Promise<FamilyChild[]> {
  const children = await familyOverview(c.db, ownerId, childId);
  const playable = children.flatMap(child => child.games.filter(game => PLAYABLE.includes(game.status)).map(game => game.id));
  const stored = playable.length === 0 ? [] : await c.db.game.findMany({
    where: { id: { in: playable }, ownerId, deletedAt: null },
    select: { id: true, configJson: true, adventureAlbum: { select: { snapshotJson: true } } },
  });
  const rows = new Map(stored.map(row => [row.id, row]));
  return children.map(child => {
    let avatarUrl: string | null = null;
    const adventures = child.games.map((game): FamilyAdventure => {
      const row = rows.get(game.id);
      if (!PLAYABLE.includes(game.status) || !row?.configJson) return { gameId: game.id, title: game.title, ready: false, worlds: [], tracked: false };
      let config: GameConfig;
      try {
        config = parseGameConfig(row.configJson);
        if (config.gameId !== game.id) throw new Error("family-content-mismatch");
      } catch {
        // One unreadable game never takes the family area down. It is still offered to play.
        return { gameId: game.id, title: game.title, ready: true, worlds: [], tracked: false };
      }
      // The newest playable game's sticker: the child as they look in the game they play now, signed afresh.
      avatarUrl = withFreshAssetUrls(c, { url: config.child.avatarUrl }).url;
      if (!config.adventure) return { gameId: game.id, title: game.title, ready: true, worlds: summarizeWorlds(config, null), tracked: false };
      try {
        const snapshot = row.adventureAlbum ? JSON.parse(row.adventureAlbum.snapshotJson) : emptyAdventureProgress(game.id, config.adventure);
        return { gameId: game.id, title: game.title, ready: true, worlds: summarizeWorlds(config, readAdventureProgress(snapshot, game.id, config.adventure)), tracked: true };
      } catch {
        // Progress that can't be read is not shown as zero: the map stays, without counts.
        return { gameId: game.id, title: game.title, ready: true, worlds: summarizeWorlds(config, null), tracked: false };
      }
    });
    // Before any game is playable, the sticker made for the child while their game is being drawn, if there is one.
    const drawn = [...child.games].reverse().find(game => game.childProfile?.avatarAssetId)?.childProfile?.avatarAssetId;
    avatarUrl ??= drawn ? signedAssetUrl(c, drawn) : null;
    return { id: child.id, name: child.displayName, avatarUrl, adventures };
  });
}

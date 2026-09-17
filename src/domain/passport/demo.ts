import { publicBeachDemo } from "../../../content/demo/beach-v1";
import assets from "../../../content/demo/passport-v1-assets.json";
import { emptyAdventureProgress, recordAdventureEvent } from "../adventure/progress";
import { projectPassport, type PassportView } from "./passport";
import type { Locale } from "@/i18n/config";
import { getDict } from "@/i18n";

/** Only the approved fictional demo; no customer data or invented world sales. */
export function demoPassport(locale: Locale): PassportView {
  const config = publicBeachDemo(locale), book = config.adventure!, board = book.boards[0]!, copy = getDict(locale).travelPassport;
  let progress = emptyAdventureProgress(config.gameId, book);
  for (const targetId of board.targetIds) progress = recordAdventureEvent(progress, config.gameId, book, { kind: "target-found", boardSlug: board.boardSlug, targetId, variant: "A" }).progress;
  for (const item of board.discoveries.slice(0, 2)) progress = recordAdventureEvent(progress, config.gameId, book, { kind: "discovery-found", boardSlug: board.boardSlug, discoveryId: item.id }).progress;
  const pages = projectPassport(config, progress, {}, (_, kind, id) => (kind === "photo" ? assets.photos : assets.discoveries)[id as never], false)[0]!.pages;
  // Eight explicitly future, unnamed places demonstrate book navigation, not
  // eight fabricated purchasable boards or copies of another child's images.
  for (let i = 1; i < 9; i++) pages.push({ id: `example-future-${i}`, title: copy.demoFuture, state: "locked", finds: 0, stampIcon: "", discoveries: board.discoveries.map((d, n) => ({ id: `example-${i}-${n}`, collected: false, rarity: d.rarity ?? "common" })) });
  return { name: config.child.name, avatarUrl: config.child.avatarUrl, preparing: 0, worlds: [{ id: "example-seaside", title: copy.demoWorld, pages }] };
}

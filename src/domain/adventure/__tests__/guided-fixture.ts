import { adventureFixture } from "./fixture";
import { attachAdventureBook } from "../compose";

export function guidedFixture() {
  const fixture = adventureFixture(3), board = fixture.catalog.boards[0]!;
  if (board.status !== "ready") throw new Error("fixture");
  board.plannedHides = 3;
  board.collectionUi = "guided-v1";
  const first = board.discoveries[0]!;
  board.discoveries = Array.from({ length: 6 }, (_, i) => {
    const x = .04 + i * .15;
    return { ...first, id:`item-${i}`, name:{he:`פריט ${i}`,en:`Item ${i}`},
      rarity: i < 3 ? "common" : i < 5 ? "rare" : "epic", difficulty: i < 3 ? 1 : i < 5 ? 2 : 3,
      visibleRect:{x,y:.13,w:.04,h:.05}, hitRect:{x,y:.13,w:.04,h:.05}, cardCrop:{x:x-.01,y:.12,w:.06,h:.07} };
  });
  return { fixture, config:attachAdventureBook(fixture.config,fixture.catalog,["pilot-test"]) };
}

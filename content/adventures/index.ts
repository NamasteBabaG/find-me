import plannedPilot from "./search-pilot.json";
import testBoard from "./test-board.json";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";

/** Deliberately NOT imported into content/scenes or the purchasable catalog. */
export const ADVENTURE_PILOT = AdventureCatalogSchema.parse(plannedPilot);
/** The pilot's marked dummy board: playable locally (scripts/pilot-game.ts), never sold, never art. */
export const ADVENTURE_TEST_BOARD = AdventureCatalogSchema.parse(testBoard);

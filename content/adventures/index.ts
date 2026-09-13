import plannedPilot from "./portrait-pilot.json";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";

/** Deliberately NOT imported into content/scenes or the purchasable catalog. */
export const ADVENTURE_PILOT = AdventureCatalogSchema.parse(plannedPilot);

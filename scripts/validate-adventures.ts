import path from "node:path";
import { ADVENTURE_PILOT, ADVENTURE_TEST_BOARD } from "../content/adventures";
import { ADVENTURE_THREE_BOARDS } from "../content/adventures/three-boards";
import { ADVENTURE_EXPANDED_BOARDS } from "../content/adventures/expanded-boards";
import { ADVENTURE_DENSITY_BOARDS } from "../content/adventures/density-boards";
import { WIZARD_ADVENTURE_CATALOG } from "../content/adventures/wizard-release";
import { REFRESHED_WIZARD_CATALOG } from "../content/adventures/wizard-refresh-release";
import { INTEGRATED_WIZARD_CATALOG } from "../content/adventures/wizard-integrated-release";
import { validateAdventureAssets } from "../src/services/adventure-content.service";

const publicRoot = path.join(process.cwd(), "public");
void Promise.all([validateAdventureAssets(ADVENTURE_PILOT, publicRoot), validateAdventureAssets(ADVENTURE_TEST_BOARD, publicRoot), validateAdventureAssets(ADVENTURE_THREE_BOARDS, publicRoot),validateAdventureAssets(ADVENTURE_EXPANDED_BOARDS,publicRoot),validateAdventureAssets(ADVENTURE_DENSITY_BOARDS,publicRoot),validateAdventureAssets(WIZARD_ADVENTURE_CATALOG,publicRoot),validateAdventureAssets(REFRESHED_WIZARD_CATALOG,publicRoot),validateAdventureAssets(INTEGRATED_WIZARD_CATALOG,publicRoot)])
  .then(([pilot, test, three,expanded,density,wizard,refreshed,integrated]) => {
    console.log(`Adventure content: ${pilot.planned} planned, ${pilot.ready} ready. Planned boards are NOT playable or purchasable.`);
    console.log(`Test board: ${test.ready} ready dummy board (art bytes, hash and size verified). It is for the local pilot only, never sold.`);
    console.log(`Three-board pilot: ${three.ready} native 4K art assets verified; personal render approval and activation are separate.`);
    console.log(`Expanded local pilot: ${expanded.ready} native 4K boards verified; no paid-catalog activation.`);
    console.log(`Density-v3 local pilot: ${density.ready} native 4K boards verified; parent likeness review remains separate.`);
    console.log(`QA wizard v10: ${wizard.ready} native 4K boards verified, 27 authored hides and 54 mapped discoveries. Historical purchases remain pinned.`);
    console.log(`QA wizard v11: ${refreshed.ready} refreshed native 4K boards verified, 27 hides and 54 discoveries, shared with the storefront and main generation pipeline.`);
    const integratedHides = INTEGRATED_WIZARD_CATALOG.boards.reduce((total, board) => total + board.plannedHides, 0);
    console.log(`QA wizard v12: ${integrated.ready} current 4K masters verified, ${integratedHides} hides across Journey and Kingdom (27 per purchased world), with version-bound automatic review.`);
  })
  .catch(error => { console.error(error); process.exitCode = 1; });

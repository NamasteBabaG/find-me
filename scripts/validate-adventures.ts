import path from "node:path";
import { ADVENTURE_PILOT, ADVENTURE_TEST_BOARD } from "../content/adventures";
import { ADVENTURE_THREE_BOARDS } from "../content/adventures/three-boards";
import { ADVENTURE_EXPANDED_BOARDS } from "../content/adventures/expanded-boards";
import { ADVENTURE_DENSITY_BOARDS } from "../content/adventures/density-boards";
import { validateAdventureAssets } from "../src/services/adventure-content.service";

const publicRoot = path.join(process.cwd(), "public");
void Promise.all([validateAdventureAssets(ADVENTURE_PILOT, publicRoot), validateAdventureAssets(ADVENTURE_TEST_BOARD, publicRoot), validateAdventureAssets(ADVENTURE_THREE_BOARDS, publicRoot),validateAdventureAssets(ADVENTURE_EXPANDED_BOARDS,publicRoot),validateAdventureAssets(ADVENTURE_DENSITY_BOARDS,publicRoot)])
  .then(([pilot, test, three,expanded,density]) => {
    console.log(`Adventure content: ${pilot.planned} planned, ${pilot.ready} ready. Planned boards are NOT playable or purchasable.`);
    console.log(`Test board: ${test.ready} ready dummy board (art bytes, hash and size verified). It is for the local pilot only, never sold.`);
    console.log(`Three-board pilot: ${three.ready} native 4K art assets verified; personal render approval and activation are separate.`);
    console.log(`Expanded local pilot: ${expanded.ready} native 4K boards verified; no paid-catalog activation.`);
    console.log(`Density-v3 local pilot: ${density.ready} native 4K boards verified; parent likeness review remains separate.`);
  })
  .catch(error => { console.error(error); process.exitCode = 1; });

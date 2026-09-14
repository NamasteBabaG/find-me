import path from "node:path";
import { ADVENTURE_PILOT, ADVENTURE_TEST_BOARD } from "../content/adventures";
import { validateAdventureAssets } from "../src/services/adventure-content.service";

const publicRoot = path.join(process.cwd(), "public");
void Promise.all([validateAdventureAssets(ADVENTURE_PILOT, publicRoot), validateAdventureAssets(ADVENTURE_TEST_BOARD, publicRoot)])
  .then(([pilot, test]) => {
    console.log(`Adventure content: ${pilot.planned} planned, ${pilot.ready} ready. Planned boards are NOT playable or purchasable.`);
    console.log(`Test board: ${test.ready} ready dummy board (art bytes, hash and size verified). It is for the local pilot only, never sold.`);
  })
  .catch(error => { console.error(error); process.exitCode = 1; });

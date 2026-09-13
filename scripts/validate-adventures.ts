import path from "node:path";
import { ADVENTURE_PILOT } from "../content/adventures";
import { validateAdventureAssets } from "../src/services/adventure-content.service";

void validateAdventureAssets(ADVENTURE_PILOT, path.join(process.cwd(), "public"))
  .then(result => {
    console.log(`Adventure content: ${result.planned} planned, ${result.ready} ready. Planned boards are NOT playable or purchasable.`);
  })
  .catch(error => { console.error(error); process.exitCode = 1; });

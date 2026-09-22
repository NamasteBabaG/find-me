/** Complete 18-board authoring inventory. Importing never activates production.
 * Personal candidate approval is separate and enforced by the local assembler. */
import {AdventureCatalogSchema} from '../../src/domain/adventure/content';
import {THREE_PATCH_BOARDS,ADVENTURE_THREE_BOARDS} from './three-boards';
import {MAGIC_PILOT_PATCH_BOARDS,MAGIC_PILOT_CATALOG} from './magic-pilot';
import {JOURNEY_REFRESH_PATCH_BOARDS,JOURNEY_REFRESH_CATALOG} from './journey-refresh-pilot';
import {TWO_WORLD_AUTHORING,TWO_WORLD_PATCH_BOARDS,TWO_WORLD_RELEASE_ID} from './two-worlds-production';
import {TWO_WORLD_CATALOG} from './two-worlds-discoveries';
import journey from '../worlds/journey/world.json';
import kingdom from '../worlds/kingdom/world.json';
export const TWO_WORLD_WORLD_ART=[journey,kingdom];
const retained=[
 {world:'journey',route:'newyork',slug:'adventure-newyork',en:'New York'},
 {world:'journey',route:'amazon',slug:'adventure-amazon-refresh-v6',en:'Amazon'},
 {world:'kingdom',route:'castlegate',slug:'magic-castlegate',en:'Castle courtyard'},
 {world:'kingdom',route:'fairyforest',slug:'fairyforest',en:'Fairy forest'},
 {world:'kingdom',route:'giantlibrary',slug:'magic-giantlibrary',en:'Giant library'},
];
const en:Record<string,string>={marrakech:'Marrakech',paris:'Paris',tokyo:'Tokyo',greatwall:'Great Wall of China',antarctica:'Antarctica',sydney:'Sydney',giza:'Giza',dragoncave:'Dragon cave',icepalace:'Ice palace',underwater:'Underwater kingdom',cloudcity:'Cloud city',sweetworkshop:'Sweet workshop',nightcarnival:'Night carnival'};
const routes=[...retained,...TWO_WORLD_AUTHORING.map(b=>({world:b.world,route:b.route,slug:b.slug,en:en[b.route]!}))];
export const TWO_WORLD_RELEASE_ROUTES=TWO_WORLD_WORLD_ART.flatMap(w=>w.nodes.map(n=>{
 const route=routes.find(r=>r.world===w.slug&&r.route===n.boardSlug);if(!route)throw Error(`Missing route ${w.slug}/${n.boardSlug}`);return route;
}));
const boards=[...THREE_PATCH_BOARDS,...MAGIC_PILOT_PATCH_BOARDS,...JOURNEY_REFRESH_PATCH_BOARDS,...TWO_WORLD_PATCH_BOARDS];
const plans=[...ADVENTURE_THREE_BOARDS.boards,...MAGIC_PILOT_CATALOG.boards,...JOURNEY_REFRESH_CATALOG.boards,...TWO_WORLD_CATALOG.boards];
export const TWO_WORLD_RELEASE_BOARDS=TWO_WORLD_RELEASE_ROUTES.map(r=>{const b=boards.find(b=>b.board===r.slug);if(!b)throw Error(`Missing placement ${r.slug}`);return b;});
export const TWO_WORLD_RELEASE_CATALOG=AdventureCatalogSchema.parse({version:1,releaseId:TWO_WORLD_RELEASE_ID,boards:TWO_WORLD_RELEASE_ROUTES.map(r=>{
 const plan=plans.find(b=>b.boardSlug===r.slug);if(plan?.status!=='ready')throw Error(`Missing measured art ${r.slug}`);
 return {...plan,worldSlug:r.world,name:{...plan.name,en:r.en},postcard:{...plan.postcard,title:{...plan.postcard.title,en:`My adventure — ${r.en}`}}};
})});
/** Historical human vetoes. Rejected attempts remain excluded; replacement
 * attempt 3 for each affected hide is bound by the final-review receipts. */
export const TWO_WORLD_RESOLVED_VISUAL_HOLDS:Record<string,string>={
 'journey-paris-refresh-v7':'Hide 3: selected second candidate still fails age/scale judge and enlarges bakery cart. Do not ship either candidate.',
 'journey-tokyo-refresh-v6':'Hide 2 removes a neighbouring child; hide 3 changes the foreground woman. Automatic pass does not satisfy original-source preservation.',
 'journey-sydney-refresh-v6':'Hide 3 introduces a truncated surfboard and wooden platform; the authored activity is hopping on sand. Repair brief mistakenly described a different activity.',
 'magic-sweetworkshop-refresh-v3':'Hide 3 redraws counter over the neighbouring child’s face. Candidate cannot be published despite automatic pass.',
};
// Resolved with source-bound attempt 3, reviewed both natively and in context.
// History above stays explicit; no failed attempt is eligible for assembly.
export const TWO_WORLD_VISUAL_HOLDS:Record<string,string>={};

import paris from './expansion/paris.json';
import marrakech from './expansion/marrakech.json';
import tokyo from './expansion/tokyo.json';
import greatwall from './expansion/greatwall.json';
import sydney from './expansion/sydney.json';
import antarctica from './expansion/antarctica.json';
import amazon from './expansion/amazon-size.json';
import {THREE_PATCH_BOARDS,ADVENTURE_THREE_BOARDS} from './three-boards';
import {LocalPatchBoardSchema,assertPlaceable} from '../../src/domain/scene/local-patch-hides';
import {AdventureCatalogSchema,ReadyAdventureBoardSchema} from '../../src/domain/adventure/content';
/** Isolated authored content. Never registered with the paid creation catalog. */
export const EXPANSION_SPECS=[amazon,paris,marrakech,tokyo,greatwall,sydney,antarctica].map(s=>({patchBoard:LocalPatchBoardSchema.parse(s.patchBoard),plan:ReadyAdventureBoardSchema.parse(s.plan)}));
export const EXPANDED_PATCH_BOARDS=[THREE_PATCH_BOARDS[0]!,EXPANSION_SPECS[0]!.patchBoard,THREE_PATCH_BOARDS[2]!,...EXPANSION_SPECS.slice(1).map(s=>s.patchBoard)];
for(const board of EXPANDED_PATCH_BOARDS)assertPlaceable(board,{width:3840,height:2160});
export const ADVENTURE_EXPANDED_BOARDS=AdventureCatalogSchema.parse({version:1,releaseId:'expanded-boards-20260914-v1',boards:[ADVENTURE_THREE_BOARDS.boards[0]!,EXPANSION_SPECS[0]!.plan,ADVENTURE_THREE_BOARDS.boards[2]!,...EXPANSION_SPECS.slice(1).map(s=>s.plan)]});

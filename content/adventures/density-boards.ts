import paris from './density-v3/paris.json';
import marrakech from './density-v3/marrakech.json';
import tokyo from './density-v3/tokyo.json';
import greatwall from './density-v3/greatwall.json';
import sydney from './density-v3/sydney.json';
import antarctica from './density-v3/antarctica.json';
import amazon from './expansion/amazon-size.json';
import {THREE_PATCH_BOARDS,ADVENTURE_THREE_BOARDS} from './three-boards';
import {LocalPatchBoardSchema,assertPlaceable} from '../../src/domain/scene/local-patch-hides';
import {AdventureCatalogSchema,ReadyAdventureBoardSchema} from '../../src/domain/adventure/content';
/** Parent-approved, explicitly selected local pilot. Not a paid/public catalog entry. */
export const DENSITY_SPECS=[paris,marrakech,tokyo,greatwall,sydney,antarctica].map(s=>({patchBoard:LocalPatchBoardSchema.parse(s.patchBoard),plan:ReadyAdventureBoardSchema.parse(s.plan)}));
export const DENSITY_PATCH_BOARDS=[THREE_PATCH_BOARDS[0]!,LocalPatchBoardSchema.parse(amazon.patchBoard),THREE_PATCH_BOARDS[2]!,...DENSITY_SPECS.map(s=>s.patchBoard)];
for(const board of DENSITY_PATCH_BOARDS)assertPlaceable(board,{width:3840,height:2160});
export const ADVENTURE_DENSITY_BOARDS=AdventureCatalogSchema.parse({version:1,releaseId:'density-nine-boards-20260914-v3',boards:[ADVENTURE_THREE_BOARDS.boards[0]!,ReadyAdventureBoardSchema.parse(amazon.plan),ADVENTURE_THREE_BOARDS.boards[2]!,...DENSITY_SPECS.map(s=>s.plan)]});

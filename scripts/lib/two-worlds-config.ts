import {GameConfigSchema} from '../../src/domain/game/config';
import {TWO_WORLD_WORLD_ART,TWO_WORLD_RELEASE_ROUTES} from '../../content/adventures/two-worlds-release';
import {threeBoardConfig} from './adventure-three-config';
/** Independent real maps; missing held boards are omitted, never unlock placeholders. */
export function twoWorldsConfig(input:Parameters<typeof threeBoardConfig>[0]){
 if(!input.boards||!input.catalog)throw Error('Explicit reviewed inventory required');
 const parts=TWO_WORLD_WORLD_ART.map(w=>{
  const slugs=input.catalog!.boards.filter(b=>b.worldSlug===w.slug).map(b=>b.boardSlug);
  const part=threeBoardConfig({...input,boards:input.boards!.filter(b=>slugs.includes(b.board)),world:{slug:w.slug,name:w.name.he,mapArt:w.map.art}});
  const nodes=w.nodes.flatMap(n=>{const route=TWO_WORLD_RELEASE_ROUTES.find(r=>r.world===w.slug&&r.route===n.boardSlug);return route&&slugs.includes(route.slug)?[{...n,boardSlug:route.slug}]:[];}).map((n,i)=>({...n,routeIndex:i+1}));
  return {...part,worlds:[{...part.worlds![0]!,map:w.map,nodes}]};
 });
 return GameConfigSchema.parse({...parts[0],styleVersion:'two-worlds-reviewed-v1',packageTier:'TWO_WORLDS',worlds:parts.flatMap(p=>p.worlds),scenes:parts.flatMap(p=>p.scenes)});
}

import {beforeEach, describe, expect, it, vi} from 'vitest';
const rig=vi.hoisted(()=>({user:{id:'owner'} as {id:string}|null,media:vi.fn()}));
vi.mock('@/lib/server/session',()=>({currentUser:async()=>rig.user}));
vi.mock('@/lib/server/qa-access',()=>({qaAccessDenied:async()=>null}));
vi.mock('@/services/container',()=>({getContainer:()=>({})}));
vi.mock('@/services/passport-media.service',()=>({ownerPassportMedia:rig.media}));
import {GET} from './route';
import {PassportAccessError} from '@/services/passport.service';
const send=(caller:string)=>GET(new Request('http://localhost/api/passport/media?childId=child&gameId=game&board=board&kind=discovery&id=item',{headers:{'x-real-ip':caller}}));
beforeEach(()=>{rig.user={id:'owner'};rig.media.mockReset().mockResolvedValue(Buffer.from('test-webp'));});
describe('passport media burst budget',()=>{
 it('can turn through 18 pages, including six cards, a photo and a turning leaf per page',async()=>{
  for(let i=0;i<18*8;i++)expect((await send('two-world-reader')).status,`media request ${i+1}`).toBe(200);
 });
 it('still throttles a runaway caller before expensive media work',async()=>{
  for(let i=0;i<360;i++)expect((await send('runaway-reader')).status).toBe(200);
  const blocked=await send('runaway-reader');expect(blocked.status).toBe(429);expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(rig.media).toHaveBeenCalledTimes(360);
 });
 it('does not turn the larger display budget into access to private images',async()=>{
  rig.user=null;expect((await send('anonymous-reader')).status).toBe(401);expect(rig.media).not.toHaveBeenCalled();
  rig.user={id:'other-owner'};rig.media.mockRejectedValue(new PassportAccessError('not-found'));
  expect((await send('other-reader')).status).toBe(404);
 });
});

import {describe,it,expect} from 'vitest';
import {validateReviewedChildGeometry,threeBoardConfig} from '../../../../scripts/lib/adventure-three-config';
import {THREE_PATCH_BOARDS} from '../../../../content/adventures/three-boards';
describe('reviewed personal geometry',()=>{
  const good={x:85,y:350,w:90,h:295,headX:127,headY:402};
  it('accepts an actual child outside the original planning mask',()=>expect(validateReviewedChildGeometry(good)).toEqual(good));
  it.each([{}, {...good,headX:1},{...good,w:900},{...good,y:NaN},{...good,h:0}])('rejects missing or invalid face/hit bounds',g=>expect(()=>validateReviewedChildGeometry(g as typeof good)).toThrow());
  it('requires actual geometry for every personal render',()=>{
    const patchUrls=Object.fromEntries(THREE_PATCH_BOARDS.flatMap(b=>b.hides.map(h=>[h.id,'/patch.png'])));
    expect(()=>threeBoardConfig({gameId:'test',childName:'בר',avatarUrl:'/avatar.png',patchUrls,composedAt:new Date().toISOString()})).toThrow('Actual child geometry');
  });
});

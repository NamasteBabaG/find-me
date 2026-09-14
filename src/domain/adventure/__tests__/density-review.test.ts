import {describe,it,expect} from 'vitest';
import {assertVisualSelection} from '../../../../scripts/lib/adventure-density-review';
const e={hideId:'adventure-paris-density-v3-2',source:'storage/adventure-bar-density-20260914/rejected.png',sourceSha256:'0'.repeat(64),receipt:'receipt.json',receiptSha256:'0'.repeat(64),inputs:'inputs.json',inputsSha256:'0'.repeat(64),geometry:{x:40,y:160,w:150,h:210,headX:100,headY:220},visualAccepted:true as const,observations:'Complete likeness and silhouette reviewed'};
describe('density publication visual gate',()=>{
 it('does not treat technical success as permission to use a parent-rejected image',()=>expect(()=>assertVisualSelection(e,{accepted:true,costUnknown:false},['rejected.png'])).toThrow('Parent/visual rejection'));
 it('cannot publish a technically refused patch even after visual approval',()=>expect(()=>assertVisualSelection(e,{accepted:false,costUnknown:false,refusedBecause:'render'},[])).toThrow('technically refused'));
 it('cannot publish an uncertain purchase',()=>expect(()=>assertVisualSelection(e,{accepted:true,costUnknown:true},[])).toThrow());
 it('rejects geometry whose face lies outside its click target',()=>expect(()=>assertVisualSelection({...e,geometry:{...e.geometry,headX:400}},{accepted:true,costUnknown:false},[])).toThrow('geometry'));
 it('accepts a separately approved, settled and valid selection',()=>expect(()=>assertVisualSelection(e,{accepted:true,costUnknown:false},[])).not.toThrow());
});

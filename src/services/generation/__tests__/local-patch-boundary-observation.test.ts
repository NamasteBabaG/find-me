import { describe, expect, it } from 'vitest';
import { parseLocalPatchBoardVerdicts, localPatchQualityDisposition } from '../local-patch-judge';
import { PLAYER_REVIEW_MODE } from '../local-patch-player-review';
import { diagnoseVisualSceneAnswer, parseVisualSceneVerdicts } from '../visual-review';

const id = 'synthetic-boundary-hide';
const observation = 'The foreground head connects to its neck, shoulders, hands and torso across the actual return edge. The bench legs and nearby child remain complete with natural overlap. No half face, disconnected limb or hard rectangular join is visible in the player view.';
const verdict = () => ({
  childPresent:'pass', childOnlyOnce:'pass', childComplete:'pass', pictureWhole:'pass', styleMatch:'pass',
  scaleRight:'pass', groundContact:'pass', faceLikeness:'pass', faceReadable:'pass', severeSeam:'pass', ageAppropriate:'pass',
  lightingMatch:'pass', neighborsIntact:'pass', verdict:'pass', reason:'The synthetic child and all inspected scene boundaries are coherent.', faults:[],
  integrationEvidence:{style:'The child and nearby people have the same matte drawn contour vocabulary.',lighting:'The target shares the neighboring people\'s soft local lighting.',neighbors:'Every adjacent visible head remains connected to its own body and hands.'},
  boundaryIntegrity:Object.fromEntries(['left','top','right','bottom'].map(edge=>[edge,{status:'pass',observation}])) as Record<string,{status:string;observation:string}>,
});
const parse = (v: unknown) => parseLocalPatchBoardVerdicts(JSON.stringify({hides:[{hideId:id,evidenceIds:[id+':before',id+':after'],verdict:v}]}),[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id] ?? null;

describe('bounded complete return-boundary observations',()=>{
  it('reparses a retained complete pass with a concrete observation longer than 240 characters',()=>{
    expect(observation.length).toBeGreaterThan(240);
    const result=parse(verdict());
    expect(result?.verdict).toBe('pass');
    expect(localPatchQualityDisposition(result,12).state).toBe('acceptable');
  });
  it('still rejects a broken boundary even when the model claims an overall pass',()=>{
    const v=verdict();v.boundaryIntegrity.left={status:'fail',observation:'At the left return join, the foreground child\'s head ends against a straight edge with no connected neck or torso.'};
    const result=parse(v);
    expect(result?.pictureWhole).toBe('fail');expect(result?.verdict).toBe('fail');
    expect(localPatchQualityDisposition(result,12).state).toBe('retry');
  });
  it('keeps missing boundaries and excessively large prose unresolved',()=>{
    const absent=verdict();delete absent.boundaryIntegrity.right;expect(parse(absent)).toBeNull();
    const excessive=verdict();excessive.boundaryIntegrity.bottom!.observation='x'.repeat(601);expect(parse(excessive)).toBeNull();
  });
  it('reads a complete fenced provider response without changing the evidence or historical parser',()=>{
    const raw=JSON.stringify({hides:[{hideId:id,evidenceIds:[id+':before',id+':after'],verdict:verdict()}]});
    const wrapped='```json\n'+raw+'\n```';
    expect(parseLocalPatchBoardVerdicts(wrapped,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id]).toBeNull();
    expect(parseVisualSceneVerdicts(wrapped,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id]).toEqual(parse(verdict()));
    for(const ambiguous of ['Here is my approval:\n'+wrapped,wrapped+'\nExtra conclusion',wrapped+'\n'+wrapped])
      expect(parseVisualSceneVerdicts(ambiguous,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id]).toBeNull();
  });
  it('never turns a fenced broken boundary or mismatched evidence into a pass',()=>{
    const v=verdict();v.boundaryIntegrity.left={status:'fail',observation:'The return edge severs the neighboring child head with no connected neck.'};
    const wrap=(evidenceIds:string[],value:unknown)=>'```json\n'+JSON.stringify({hides:[{hideId:id,evidenceIds,verdict:value}]})+'\n```';
    expect(parseVisualSceneVerdicts(wrap([id+':before',id+':after'],v),[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id]?.verdict).toBe('fail');
    expect(parseVisualSceneVerdicts(wrap(['other:before','other:after'],verdict()),[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id]).toBeNull();
    delete v.boundaryIntegrity.right;
    expect(parseVisualSceneVerdicts(wrap([id+':before',id+':after'],v),[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id]).toBeNull();
  });
});

describe('why an answer was refused: a code and a JSON path, never its text',()=>{
  const answer=(v:unknown,over:Record<string,unknown>={})=>'```json\n'+JSON.stringify({hides:[{hideId:id,evidenceIds:[id+':before',id+':after'],verdict:v,...over}]})+'\n```';
  const diagnose=(raw:string|null)=>diagnoseVisualSceneAnswer(raw,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE);
  const read=(raw:string|null)=>parseVisualSceneVerdicts(raw,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE)[id]??null;
  const long=(n:number)=>'Painted contours continue across the join. '.repeat(Math.ceil(n/43)).slice(0,n).trimEnd()+'.';
  const cases:[string,string|null,{code:string;path:string}|null][]=[
    ['a readable answer',answer(verdict()),null],
    ['no answer',null,{code:'empty',path:''}],
    ['prose',answer(verdict()).replace('```json\n','Here is my review:\n'),{code:'syntax',path:''}],
    ['an over-long style observation',answer({...verdict(),integrationEvidence:{...verdict().integrationEvidence,style:long(850)}}),{code:'length',path:'hides.0.verdict.integrationEvidence.style'}],
    ['an over-long boundary observation',answer({...verdict(),boundaryIntegrity:{...verdict().boundaryIntegrity,top:{status:'pass',observation:long(700)}}}),{code:'length',path:'hides.0.verdict.boundaryIntegrity.top.observation'}],
    ['an over-long fault location',answer({...verdict(),pictureWhole:'fail',verdict:'fail',faults:[{check:'pictureWhole',where:long(901)}]}),{code:'length',path:'hides.0.verdict.faults.0.where'}],
    ['seventeen faults',answer({...verdict(),pictureWhole:'fail',verdict:'fail',faults:Array.from({length:17},()=>({check:'pictureWhole',where:'A disc hangs with no hand holding it'}))}),{code:'count',path:'hides.0.verdict.faults'}],
    ['a too-short observation',answer({...verdict(),integrationEvidence:{...verdict().integrationEvidence,lighting:'okay'}}),{code:'shape',path:'hides.0.verdict.integrationEvidence.lighting'}],
    ['an invented check value',answer({...verdict(),styleMatch:'probably'}),{code:'shape',path:'hides.0.verdict.styleMatch'}],
    ['an unknown field',answer({...verdict(),mood:'calm'}),{code:'shape',path:'hides.0.verdict'}],
    ['another hide',answer(verdict(),{hideId:'other-hide'}),{code:'ids',path:'hides'}],
    ['wrong evidence ids',answer(verdict(),{evidenceIds:['other:before','other:after']}),{code:'ids',path:'hides.0.evidenceIds'}],
    ['two hides for one',(()=>{const row={hideId:id,evidenceIds:[id+':before',id+':after'],verdict:verdict()};return JSON.stringify({hides:[row,row]});})(),{code:'ids',path:'hides'}],
    ['a missing boundary',(()=>{const v=verdict();delete v.boundaryIntegrity.right;return answer(v);})(),{code:'shape',path:'hides.0.verdict.boundaryIntegrity.right'}],
  ];
  it.each(cases)('%s',(_label,raw,expected)=>{
    expect(diagnose(raw)).toEqual(expected);
    // Acceptance is the parser's alone: a diagnosis exists exactly when it refuses.
    expect(read(raw)===null).toBe(expected!==null);
  });
  it('names no reviewer text anywhere in a diagnosis',()=>{
    const raw=answer({...verdict(),pictureWhole:'fail',verdict:'fail',faults:[{check:'pictureWhole',where:'SECRET-PROSE '.repeat(40)}]});
    expect(JSON.stringify(diagnose(raw))).not.toContain('SECRET');
  });
});

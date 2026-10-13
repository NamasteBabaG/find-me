import { describe, expect, it } from 'vitest';
import { parseLocalPatchBoardVerdicts, localPatchQualityDisposition, QUALITY_READER_LOCATED, QUALITY_READER_LOCATED_V2, QUALITY_READER_STRICT, type QualityReader } from '../local-patch-judge';
import { PLAYER_REVIEW_MODE } from '../local-patch-player-review';
import { diagnoseVisualSceneAnswer, parseVisualSceneVerdicts } from '../visual-review';
import { LOCATED_390, LOCATED_390_DEFECT, located390Answer, located390Verdict } from './local-patch-dual-fixtures';

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

describe('named quality readers: the located reader admits a longer location, never a pass',()=>{
  const answer=(v:unknown)=>'```json\n'+JSON.stringify({hides:[{hideId:id,evidenceIds:[id+':before',id+':after'],verdict:v}]})+'\n```';
  const read=(raw:string,reader?:QualityReader)=>parseVisualSceneVerdicts(raw,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE,reader)[id]??null;
  const diagnose=(raw:string,reader?:QualityReader)=>diagnoseVisualSceneAnswer(raw,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE,reader);
  const failing=(where:string)=>({...verdict(),pictureWhole:'fail',verdict:'fail',faults:[{check:'pictureWhole',where}]});
  it('reads the retained 390-character refusal as the repair it reports, every character kept',()=>{
    const raw=located390Answer(id);
    expect(located390Verdict().faults[0]!.where).toHaveLength(LOCATED_390.where);
    // The deployed reading: unreadable, for that one field alone.
    expect(read(raw)).toBeNull(); expect(read(raw,QUALITY_READER_STRICT)).toBeNull();
    expect(diagnose(raw,QUALITY_READER_STRICT)).toEqual({code:'length',path:'hides.0.verdict.faults.0.where'});
    const v=read(raw,QUALITY_READER_LOCATED)!;
    expect(diagnose(raw,QUALITY_READER_LOCATED)).toBeNull();
    expect(v.pictureWhole).toBe('fail'); expect(v.verdict).toBe('fail');
    expect(v.faults).toHaveLength(1); expect(v.faults[0]!.where).toHaveLength(LOCATED_390.where);
    expect(v.faults[0]!.where.startsWith(LOCATED_390_DEFECT)).toBe(true);
    expect(localPatchQualityDisposition(v,12)).toEqual({state:'retry',faults:['pictureWhole']});
  });
  it('keeps a defect named at the end of a 600-character location, and names 601 as a size fault',()=>{
    const ending=' Last: a disc hangs beside the child with no hand holding it.';
    const where=(n:number)=>'The child stands on the cobbles and the neighbours are whole. '.repeat(20).slice(0,n-ending.length)+ending;
    const whole=read(answer(failing(where(600))),QUALITY_READER_LOCATED)!;
    expect(whole.faults[0]!.where).toHaveLength(600); expect(whole.faults[0]!.where.endsWith(ending)).toBe(true);
    expect(localPatchQualityDisposition(whole,12).state).toBe('retry');
    expect(read(answer(failing(where(601))),QUALITY_READER_LOCATED)).toBeNull();
    expect(diagnose(answer(failing(where(601))),QUALITY_READER_LOCATED)).toEqual({code:'length',path:'hides.0.verdict.faults.0.where'});
  });
  it('reads every answer the strict reader reads exactly as it did',()=>{
    for(const v of [verdict(),failing('A disc hangs beside the child with no hand holding it.')])
      expect(read(answer(v),QUALITY_READER_LOCATED)).toEqual(read(answer(v),QUALITY_READER_STRICT));
  });
  it('keeps a failed boundary with a long observation a repair under either reader',()=>{
    // The parser derives "Return boundary left: <observation>" itself; that derived
    // location must not make a located defect unreadable when it is re-derived.
    const v=verdict();v.boundaryIntegrity.left={status:'fail',observation:'At the left join a foreground head ends against a straight edge with no neck below it. '.repeat(7).slice(0,590).trimEnd()+'.'};
    for(const reader of [QUALITY_READER_STRICT,QUALITY_READER_LOCATED]){
      const result=read(answer(v),reader)!;
      expect(result.pictureWhole).toBe('fail');
      expect(localPatchQualityDisposition(result,12)).toEqual({state:'retry',faults:['pictureWhole']});
    }
  });
});

describe('quality-read/v2-located-600: a downgraded check is derived again, never read as unreadable',()=>{
  const answer=(v:unknown)=>'```json\n'+JSON.stringify({hides:[{hideId:id,evidenceIds:[id+':before',id+':after'],verdict:v}]})+'\n```';
  const read=(raw:string,reader?:QualityReader)=>parseVisualSceneVerdicts(raw,[id],12,'ready-only/v1',PLAYER_REVIEW_MODE,reader)[id]??null;
  const decide=(v:unknown,reader?:QualityReader)=>localPatchQualityDisposition(read(answer(v),reader??QUALITY_READER_LOCATED),12,{hideId:id,...(reader?{reader}:{})});
  // Codex's reproduction (v18 fixes recheck, 13 October): one located failure and one the answer never located.
  const mixed=()=>({...verdict(),pictureWhole:'fail',severeSeam:'fail',verdict:'fail',reason:'The sign is cut at the bottom join, and a seam shows somewhere.',
    faults:[{check:'pictureWhole',where:'Bottom join: the sign lettering is cut along the line'}]});
  const unlocated=()=>({...verdict(),pictureWhole:'fail',severeSeam:'fail',verdict:'fail',reason:'Something is broken at the joins.',faults:[]});
  const contradicted=()=>({...verdict(),severeSeam:'fail',verdict:'fail',reason:'A seam crosses the sign.',
    faults:[{check:'severeSeam',where:'Bottom join: doubled left edge of the sign'},{check:'pictureWhole',where:'Bottom join: the sign lettering is cut along the line'}]});
  const located=()=>({...verdict(),pictureWhole:'fail',verdict:'fail',faults:[{check:'pictureWhole',where:'Bottom join: the sign lettering is cut along the line'}]});
  it('parses byte for byte as v1-located: only the decision changes',()=>{
    for(const v of [verdict(),located(),mixed(),unlocated(),contradicted()])
      expect(read(answer(v),QUALITY_READER_LOCATED_V2)).toEqual(read(answer(v),QUALITY_READER_LOCATED));
  });
  it('decides the mixed answer as a retry for its located check, where v1 read it as unreadable',()=>{
    const v=read(answer(mixed()),QUALITY_READER_LOCATED_V2)!;
    // The unlocated failure stays what the parser made of it: unsure and recorded as downgraded, never a pass.
    expect(v).toMatchObject({pictureWhole:'fail',severeSeam:'unsure',verdict:'fail',claimedVerdict:'fail',downgraded:['severeSeam'],contradicted:[],unclassified:[]});
    expect(decide(mixed(),QUALITY_READER_LOCATED_V2)).toEqual({state:'retry',faults:['pictureWhole']});
    // Every v1 decision, and a stage that names no reader, is unchanged.
    for(const reader of [undefined,QUALITY_READER_STRICT,QUALITY_READER_LOCATED])
      expect(decide(mixed(),reader)).toEqual({state:'unresolved',faults:['integration-review-unreadable']});
  });
  it('names the checks of an answer that located nothing, and still never retries it',()=>{
    expect(decide(unlocated(),QUALITY_READER_LOCATED)).toEqual({state:'unresolved',faults:['integration-review-unreadable']});
    expect(decide(unlocated(),QUALITY_READER_LOCATED_V2)).toEqual({state:'unresolved',faults:['severeSeam','pictureWhole']});
  });
  it('changes no acceptance and no other decision',()=>{
    for(const v of [verdict(),located(),contradicted()])
      expect(decide(v,QUALITY_READER_LOCATED_V2)).toEqual(decide(v,QUALITY_READER_LOCATED));
    expect(decide(verdict(),QUALITY_READER_LOCATED_V2).state).toBe('acceptable');
    expect(decide(contradicted(),QUALITY_READER_LOCATED_V2)).toEqual({state:'retry',faults:['severeSeam']});
  });
  it('restores only a real downgrade: a forged record stays unreadable',()=>{
    const v=read(answer(mixed()),QUALITY_READER_LOCATED_V2)!;
    const forged=(over:Record<string,unknown>)=>localPatchQualityDisposition({...v,...over} as typeof v,12,{hideId:id,reader:QUALITY_READER_LOCATED_V2});
    // A downgrade of a check that now reads pass, or of a field no check owns, is not the parser's.
    expect(forged({severeSeam:'pass'})).toEqual({state:'unresolved',faults:['integration-review-unreadable']});
    expect(forged({downgraded:['severeSeam','mood']})).toEqual({state:'unresolved',faults:['integration-review-unreadable']});
    // Without its downgrade the record is another self-consistent verdict (explicit doubt), decided alike by both readers.
    const doubt={...v,downgraded:[]} as typeof v;
    expect(localPatchQualityDisposition(doubt,12,{hideId:id,reader:QUALITY_READER_LOCATED_V2}))
      .toEqual(localPatchQualityDisposition(doubt,12,{hideId:id,reader:QUALITY_READER_LOCATED}));
  });
});

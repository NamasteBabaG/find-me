import sharp from 'sharp';
import {afterEach,beforeAll,describe,it,expect,vi} from 'vitest';
import {OpenAiPatchJudge,fastMayDecide,judgementForJson} from '../judge';
import {BOARD_CHECKS,BOARD_JUDGE_MODEL,BOARD_FAST_JUDGE_MODEL,BOARD_JUDGE_VERSION,boardJudgePrompt,boardJudgeReserveCents,parseBoardVerdict} from '../board-verdict';
let png:Buffer;beforeAll(async()=>{png=await sharp({create:{width:32,height:32,channels:4,background:'red'}}).png().toBuffer();});afterEach(()=>vi.unstubAllGlobals());
const checks={identity:'pass',faceIntegrity:'pass',bodyPlacement:'pass',ageProportions:'pass',anatomy:'pass',style:'pass',relativeScale:'pass'};
const input=()=>({patchPng:png,reference:png,boardCrop:png,childName:'test',label:'test'});
const response=(model:string,extra={},withUsage=true)=>new Response(JSON.stringify({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify({checks:{...checks,...extra},reason:'visible support and intact face'})}}],...(withUsage?{usage:{prompt_tokens:2000,completion_tokens:400}}:{})}),{headers:{'x-request-id':'req_'+model}});
describe('contextual release judge',()=>{
 it('requires two passing independent reviews and records both costs, images, wire images and requests',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL)).mockResolvedValueOnce(response(BOARD_JUDGE_MODEL));vi.stubGlobal('fetch',fetch);
  const r=await new OpenAiPatchJudge('test').judge(input());expect(r.verdict).toBe('ok');expect(r.version).toBe(BOARD_JUDGE_VERSION);expect(r.reviews).toHaveLength(2);expect(r.attempts).toHaveLength(2);expect(r.costCents).toBeCloseTo(2.7);expect(r.imageHashes).toHaveLength(3);expect(r.policy).toBe('screen:strong');
  // The board and the patch as they went over the wire, the sheet not again.
  expect(r.wireImages).toHaveLength(2);expect(r.wireImages![0]!.length).toBeGreaterThan(0);
  const bodies=fetch.mock.calls.map(c=>JSON.parse(c[1].body));expect(bodies[0].max_tokens).toBe(320);expect(bodies[1].max_completion_tokens).toBe(8000);expect(bodies[1].reasoning_effort).toBe('high');expect(bodies[1].model).toBe('gpt-5.6-sol');expect(bodies[1].store).toBe(false);expect(bodies[1].service_tier).toBe('default');expect(bodies[0].messages[0].content.filter((x:any)=>x.type==='image_url')).toHaveLength(3);
  expect(boardJudgeReserveCents('test')).toBeGreaterThan(r.costCents);
  // Written to the row without the pictures.
  const json=judgementForJson(r);expect(json.wireImages).toBeUndefined();expect(json.reviews?.[0]?.wireImages).toBeUndefined();expect(JSON.stringify(json)).not.toContain('wireImages');
 });
 it('a fast identity or face failure ends it without a second paid call',async()=>{
  const fetch=vi.fn().mockResolvedValue(response(BOARD_FAST_JUDGE_MODEL,{faceIntegrity:'fail'}));vi.stubGlobal('fetch',fetch);
  const r=await new OpenAiPatchJudge('test').judge(input());expect(r.verdict).toBe('bad');expect(r.policy).toBe('screen:fast');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('a fast placement failure is a question for the strong reviewer, whose word is final',async()=>{
  // The strong reviewer sees a correct peek where the fast one saw missing feet (giza/stones, game 2).
  const fetch=vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL,{bodyPlacement:'fail'})).mockResolvedValueOnce(response(BOARD_JUDGE_MODEL));vi.stubGlobal('fetch',fetch);
  const r=await new OpenAiPatchJudge('test').judge(input());expect(r.verdict).toBe('ok');expect(r.policy).toBe('screen:strong');expect(fetch).toHaveBeenCalledTimes(2);expect(r.reviews?.[0]?.verdict).toBe('bad');
  // And the strong reviewer can still say no.
  const again=vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL,{relativeScale:'fail'})).mockResolvedValueOnce(response(BOARD_JUDGE_MODEL,{relativeScale:'fail'}));vi.stubGlobal('fetch',again);
  expect((await new OpenAiPatchJudge('test').judge(input())).verdict).toBe('bad');expect(again).toHaveBeenCalledTimes(2);
 });
 it('under the chain policy any fast failure ends it',async()=>{
  const fetch=vi.fn().mockResolvedValue(response(BOARD_FAST_JUDGE_MODEL,{bodyPlacement:'fail'}));vi.stubGlobal('fetch',fetch);
  const r=await new OpenAiPatchJudge('test',{policy:'chain'}).judge(input());expect(r.verdict).toBe('bad');expect(r.policy).toBe('chain:fast');expect(fetch).toHaveBeenCalledTimes(1);
  expect(fastMayDecide({verdict:'bad',reason:'',costCents:0,checks:{...checks,bodyPlacement:'fail'} as any},'chain')).toBe(true);
  expect(fastMayDecide({verdict:'bad',reason:'',costCents:0,checks:{...checks,bodyPlacement:'fail'} as any},'screen')).toBe(false);
 });
 it('the strong policy asks the strong reviewer alone',async()=>{
  const fetch=vi.fn().mockResolvedValue(response(BOARD_JUDGE_MODEL));vi.stubGlobal('fetch',fetch);
  const r=await new OpenAiPatchJudge('test',{policy:'strong'}).judge(input());expect(r.verdict).toBe('ok');expect(r.policy).toBe('strong');expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(fetch.mock.calls[0]![1].body).model).toBe(BOARD_JUDGE_MODEL);
 });
 it('a fast reviewer that looked and could not decide escalates; the strong reviewer holds when it cannot confirm',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL,{bodyPlacement:'uncertain'})).mockResolvedValueOnce(response(BOARD_JUDGE_MODEL,{bodyPlacement:'uncertain'}));vi.stubGlobal('fetch',fetch);
  expect((await new OpenAiPatchJudge('test').judge(input())).verdict).toBe('unknown');expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('keeps the first paid review when the second request loses its answer',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL)).mockRejectedValueOnce(new Error('connection lost')));
  const result=await new OpenAiPatchJudge('test').judge(input());
  expect(result.verdict).toBe('unknown');expect(result.costCents).toBeCloseTo(0.9);expect(result.costUnknown).toBe(true);expect(result.attempts).toHaveLength(2);
  expect(result.attempts?.[0]?.requestId).toBe('req_'+BOARD_FAST_JUDGE_MODEL);
 });
 it('keeps the first review if second-review preparation unexpectedly throws',async()=>{
  const judge=new OpenAiPatchJudge('test');
  const assess=vi.spyOn(judge as any,'assess').mockResolvedValueOnce({verdict:'ok',reason:'first passed',costCents:0.9,attempts:[{requestId:'first-paid'}]}).mockRejectedValueOnce(new Error('image decoding failed'));
  const result=await judge.judge(input());
  expect(assess).toHaveBeenCalledTimes(2);expect(result.verdict).toBe('unknown');expect(result.costCents).toBe(0.9);expect(result.costUnknown).toBe(true);expect(result.attempts?.[0]?.requestId).toBe('first-paid');
 });
 it.each(['wrong-model','missing-usage'])('fails closed on %s without another paid call',async(kind)=>{
  const fetch=vi.fn().mockResolvedValue(response(kind==='wrong-model'?'gpt-4o-mini':BOARD_FAST_JUDGE_MODEL,{},kind!=='missing-usage'));vi.stubGlobal('fetch',fetch);
  expect((await new OpenAiPatchJudge('test').judge(input())).verdict).toBe('unknown');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('refuses omitted criteria and derives failure regardless of a claimed overall verdict',()=>{
  expect(parseBoardVerdict('{"verdict":"ok","reason":"fine"}')).toBeNull();
  const {relativeScale:_r,...six}=checks;
  expect(parseBoardVerdict(JSON.stringify({verdict:'ok',checks:six,reason:'six of seven'}))).toBeNull();
  expect(parseBoardVerdict(JSON.stringify({verdict:'ok',checks:{...checks,faceIntegrity:'fail'},reason:'hole in forehead'}))?.verdict).toBe('bad');
  expect(parseBoardVerdict(JSON.stringify({verdict:'ok',checks:{...checks,relativeScale:'fail'},reason:'1.5x the child beside her'}))?.verdict).toBe('bad');
  expect(BOARD_CHECKS).toContain('relativeScale');
 });
 it('tells the judge the recipe, so a peek is judged as a peek',()=>{
  const prompt=boardJudgePrompt('test',8,{pose:'standing',support:'Hidden shoes on the sand behind the block.',occlusion:'The block hides her from the chest down.',occlusionMode:'layer',comparators:'the boy in the blue shirt beside the block',visibleFraction:0.45});
  expect(prompt).toContain('BY DESIGN');expect(prompt).toContain('must not fail bodyPlacement or anatomy for missing feet');expect(prompt).toContain('the boy in the blue shirt');expect(prompt).toContain('45%');expect(prompt).toContain('relativeScale');
  const open=boardJudgePrompt('test',8,{pose:'standing',support:'Feet on the sand.',occlusion:'None.',occlusionMode:'open'});
  expect(open).toContain('Nothing was authored in front of her');expect(open).not.toContain('BY DESIGN');
  // A peek without a polygon (the spice cones) is hidden by design as well.
  const peek=boardJudgePrompt('test',8,{pose:'peeking',support:'The ground behind the cones.',occlusion:'She hides behind the spice cones.',occlusionMode:'open'});
  expect(peek).toContain('BY DESIGN');
 });
 it.each(['truncated','over-cap','fast-tier'])('holds a plausible Sol approval with %s telemetry',async(kind)=>{
  const raw=JSON.parse(await response(BOARD_JUDGE_MODEL).text());
  if(kind==='truncated')raw.choices[0].finish_reason='length';
  if(kind==='over-cap')raw.usage.completion_tokens=8001;
  if(kind==='fast-tier')raw.service_tier='priority';
  const fetch=vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL)).mockResolvedValueOnce(new Response(JSON.stringify(raw)));
  vi.stubGlobal('fetch',fetch);
  const result=await new OpenAiPatchJudge('test').judge(input());
  expect(result.verdict).toBe('unknown');expect(result.costCents).toBeGreaterThan(0);expect(fetch).toHaveBeenCalledTimes(2);
  if(kind==='fast-tier')expect(result.costUnknown).toBe(true);
 });
});

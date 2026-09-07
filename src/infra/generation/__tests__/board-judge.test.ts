import sharp from 'sharp';
import {afterEach,beforeAll,describe,it,expect,vi} from 'vitest';
import {OpenAiPatchJudge} from '../judge';
import {BOARD_JUDGE_MODEL,BOARD_FAST_JUDGE_MODEL,BOARD_JUDGE_VERSION,boardJudgeReserveCents,parseBoardVerdict} from '../board-verdict';
let png:Buffer;beforeAll(async()=>{png=await sharp({create:{width:32,height:32,channels:4,background:'red'}}).png().toBuffer();});afterEach(()=>vi.unstubAllGlobals());
const checks={identity:'pass',faceIntegrity:'pass',bodyPlacement:'pass',ageProportions:'pass',anatomy:'pass',style:'pass'};
const input=()=>({patchPng:png,reference:png,boardCrop:png,childName:'test',label:'test'});
const response=(model:string,extra={},withUsage=true)=>new Response(JSON.stringify({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify({checks:{...checks,...extra},reason:'visible support and intact face'})}}],...(withUsage?{usage:{prompt_tokens:2000,completion_tokens:400}}:{})}),{headers:{'x-request-id':'req_'+model}});
describe('contextual release judge',()=>{
 it('requires two passing independent reviews and records both costs, images and wire requests',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL)).mockResolvedValueOnce(response(BOARD_JUDGE_MODEL));vi.stubGlobal('fetch',fetch);
  const r=await new OpenAiPatchJudge('test').judge(input());expect(r.verdict).toBe('ok');expect(r.version).toBe(BOARD_JUDGE_VERSION);expect(r.reviews).toHaveLength(2);expect(r.attempts).toHaveLength(2);expect(r.costCents).toBeCloseTo(2.7);expect(r.imageHashes).toHaveLength(3);
  const bodies=fetch.mock.calls.map(c=>JSON.parse(c[1].body));expect(bodies[0].max_tokens).toBe(320);expect(bodies[1].max_completion_tokens).toBe(8000);expect(bodies[1].reasoning_effort).toBe('high');expect(bodies[1].model).toBe('gpt-5.6-sol');expect(bodies[1].store).toBe(false);expect(bodies[1].service_tier).toBe('default');expect(bodies[0].messages[0].content.filter((x:any)=>x.type==='image_url')).toHaveLength(3);
  expect(boardJudgeReserveCents('test')).toBeGreaterThan(r.costCents);
 });
 it.each(['fail','uncertain'])('never promotes a %s placement because identity passed',async(value)=>{
  const fetch=vi.fn().mockResolvedValue(response(BOARD_FAST_JUDGE_MODEL,{bodyPlacement:value}));vi.stubGlobal('fetch',fetch);
  expect((await new OpenAiPatchJudge('test').judge(input())).verdict).toBe(value==='fail'?'bad':'unknown');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('holds when the second reviewer cannot confirm support',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(BOARD_FAST_JUDGE_MODEL)).mockResolvedValueOnce(response(BOARD_JUDGE_MODEL,{bodyPlacement:'uncertain'})));
  expect((await new OpenAiPatchJudge('test').judge(input())).verdict).toBe('unknown');
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
  expect(parseBoardVerdict(JSON.stringify({verdict:'ok',checks:{...checks,faceIntegrity:'fail'},reason:'hole in forehead'}))?.verdict).toBe('bad');
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

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { DiscoverySchema, overlaps } from '../src/domain/adventure/content';

// Measurements from returned native pixels, not requested prompt positions.
// Mechanical authoring/inspection exports only. Never modifies source artwork.
const source = 'output/imagegen/magic-castlegate-v18-fresh-master.png';
const out = 'output/imagegen/magic-castlegate-v18-authoring';
const W = 3840, H = 2160;
type Px = [number, number, number, number];
const rect = ([x, y, w, h]: Px) => ({ x: x / W, y: y / H, w: w / W, h: h / H });
const targets = [
  { id: 'purple-teapot', he: 'קנקן סגול', en: 'Purple teapot', rarity: 'common', difficulty: 1,
    hintHe: 'חפשו בין העוגות והספלים בשולחן המלכותי.', hintEn: 'Look among the cakes and cups on the royal table.',
    storyHe: 'גם בחגיגה מלכותית יש זמן לכוס תה.', storyEn: 'Even a royal celebration has time for tea.',
    category: 'object', visible: [1683,974,170,138], hit: [1717,1004,93,99], crop: [1652,950,220,183] },
  { id: 'sand-hourglass', he: 'שעון חול', en: 'Hourglass', rarity: 'common', difficulty: 1,
    hintHe: 'השומר יודע מתי מתחיל הסיפור הבא.', hintEn: 'The gatekeeper knows when the next story begins.',
    storyHe: 'החול יורד בזמן שמחכים לתור להיכנס לטירה.', storyEn: 'The sand falls while visitors wait to enter the castle.',
    category: 'object', visible: [2235,550,62,100], hit: [2243,557,46,87], crop: [2205,530,120,140] },
  { id: 'yellow-duck', he: 'ברווז עץ', en: 'Wooden duck', rarity: 'common', difficulty: 1,
    hintHe: 'גם לברווז יש תפקיד בהצגה.', hintEn: 'The duck has a part in the show too.',
    storyHe: 'ברווז העץ מחכה לתורו לעלות לבמה.', storyEn: 'The wooden duck is waiting for its turn on stage.',
    category: 'object', visible: [3027,792,122,153], hit: [3050,807,71,117], crop: [3009,775,158,190] },
  { id: 'ivy-frog', he: 'צפרדע בעציץ', en: 'Frog in a pot', rarity: 'rare', difficulty: 2,
    hintHe: 'בין העלים מציצות שתי עיניים.', hintEn: 'Two eyes are peeking out among the leaves.',
    storyHe: 'אורחת ירוקה מצאה מושב מוצל לחגיגה.', storyEn: 'A green guest found a shady seat for the celebration.',
    category: 'animal', visible: [995,1436,104,73], hit: [1015,1450,64,49], crop: [968,1408,160,125] },
  { id: 'knight-puppet', he: 'בובת אביר', en: 'Knight puppet', rarity: 'rare', difficulty: 2,
    hintHe: 'לא כל אביר בטירה הוא אדם אמיתי.', hintEn: 'Not every knight in the castle is a real person.',
    storyHe: 'האביר הקטן מתאמן לקראת ההצגה.', storyEn: 'The little knight is rehearsing for the show.',
    category: 'object', visible: [2927,707,130,240], hit: [2952,754,67,173], crop: [2907,688,170,278] },
  { id: 'dog-blue-ribbon', he: 'הסרט הכחול של הכלב', en: "The dog's blue ribbon", rarity: 'epic', difficulty: 3,
    hintHe: 'מישהו התלבש לחגיגה — ויש לו ארבע רגליים.', hintEn: 'Someone dressed up for the party — and has four legs.',
    storyHe: 'גם הכלב הגיע לבוש חגיגי.', storyEn: 'The dog dressed up for the celebration too.',
    category: 'object', visible: [1709,526,54,49], hit: [1716,533,35,34], crop: [1678,496,128,106] },
] as const;

async function main() {
  const bytes = await fs.readFile(source);
  const m = await sharp(bytes).metadata();
  assert.equal(m.width, W); assert.equal(m.height, H);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const discoveries = targets.map(t => DiscoverySchema.parse({
    id: t.id, name: { he: t.he, en: t.en }, hint: { he: t.hintHe, en: t.hintEn },
    category: t.category, rarity: t.rarity, difficulty: t.difficulty,
    description: { kind: 'story', text: { he: t.storyHe, en: t.storyEn } },
    visibleRect: rect([...t.visible]), hitRect: rect([...t.hit]), cardCrop: rect([...t.crop]),
  }));
  assert.equal(new Set(discoveries.map(d => d.id)).size, 6);
  for (const [i, d] of discoveries.entries()) {
    assert(!discoveries.slice(0, i).some(other => overlaps(d.hitRect, other.hitRect)), 'Overlapping hit areas');
    assert(d.visibleRect.x >= .24 && d.visibleRect.x + d.visibleRect.w <= .83);
    assert(d.visibleRect.y >= .24 && d.visibleRect.y + d.visibleRect.h <= .71);
  }
  assert.deepEqual(['common','rare','epic'].map(r => discoveries.filter(d => d.rarity === r).length), [3,2,1]);
  await fs.mkdir(out, { recursive: true });
  for (const t of targets) {
    const [left, top, width, height] = t.crop;
    await sharp(bytes).extract({ left, top, width, height }).png().toFile(`${out}/${t.id}.png`);
  }
  const draft = {
    status: 'authored-not-playtested', boardSlug: 'magic-castlegate', source,
    art: { width: W, height: H, sha256 }, discoveries,
    checks: { schema: true, nonOverlappingHits: true, sourceHash: true, rarity321: true, measuredInteriorBounds: true },
    remaining: ['real game mobile/desktop pan, zoom, HUD and touch verification', 'personal hide placement and discovery protection', 'release integration'],
  };
  await fs.writeFile(`${out}/discoveries.draft.json`, JSON.stringify(draft, null, 2) + '\n');
  console.log(JSON.stringify({ source, sha256, dimensions: [W,H], verifiedTargets: discoveries.map(d => d.id), draft: `${out}/discoveries.draft.json` }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });

/** Author a bounded art-only revision. No API calls, no child placement, no activation. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

async function main() {
const output = 'output/imagegen/adventure-zoomout-20260914-v2';
const previous = JSON.parse(readFileSync('output/imagegen/adventure-expansion-20260914-v1/plan.json', 'utf8'));
const revisions = [];
mkdirSync(output, { recursive: true });
for (const board of previous.boards as { id: string; items: string }[]) {
  const source = `public/scenes/adventure-${board.id}-v1/base.webp`;
  const input = `${output}/${board.id}-source.png`;
  const promptFile = `${output}/${board.id}.prompt.txt`;
  if (existsSync(input) || existsSync(promptFile)) throw Error(`Frozen inputs already exist: ${board.id}`);
  await sharp(source).png().toFile(input);
  const prompt = `Use case: precise-object-edit — framing/zoom-out only.
EDIT TARGET: the supplied ${board.id} illustration. It is the sole and authoritative reference for drawing style, people, location, materials, color and light. This is NOT a style transfer and NOT a new interpretation.

REQUESTED CHANGE: a clearly wider view of THIS SAME scene. At the SAME 3840x2160 output resolution, make the existing people and their objects about 25 percent smaller in BOTH linear dimensions. Think of the existing scene occupying approximately the central 75 percent of the new frame's width and height, then seamlessly paint the newly revealed surroundings. Show more of the place around the existing activities, not just empty margins. Retain recognizable existing groups and their relative relationships. Do not merely add a narrow strip while leaving foreground figures huge. No frame inside a frame, no panel border, no inset, no collage, no blurred extensions.

SHALLOW GEOMETRY IS LOCKED: keep the elevated oblique viewpoint and compressed spatial depth. Extend the inhabited ground sideways and toward the lower corners; do NOT create a long street, a central escape corridor, a faraway vanishing point, or a tiny distant crowd. Most people's heads should remain almost the same size across upper, middle and lower activity bands (within roughly 15-20 percent after allowing real adult/child differences). The existing front-row adults must also shrink; do not replace them with new oversized foreground people. Preserve the narrow landmark/background strip. Do not solve zoom-out by adding a large sky, sea, mountain or roof area.

NEWLY REVEALED AREA: add around 20-30 individually drawn people in 6-9 additional small, varied activities appropriate to this existing place, connected by short paths, stall edges, benches and natural props. Keep it busy and richly inhabited like the source, with readable little stories rather than a packed wall of faces. New figures use the same smaller scale as the resized existing figures. Distribute activities across the whole board. Preserve clean hands, anatomically coherent limbs, distinct faces, clear eyes with pupils, eyebrows and mouths. Preserve face detail at native 4K; smaller must not mean smeared or anonymous.

ABSOLUTE STYLE INVARIANTS: reproduce the source's specific hand-drawn brown contours, irregular human line weight, painterly matte color, selective tactile brush texture, characteristic face construction, cloth folds, edge treatment and shaped light/shadow transitions. Keep the same warmth, local palette, contrast, saturation and illumination direction. The new areas must look drawn by the very same artist on the very same page. Do not smooth, polish, photorealize, airbrush, simplify into vector/cel art, add CGI gloss, sharpen into sterile digital outlines, or overlay new uniform grain/crosshatching. This is a camera-framing change, not an aesthetic change.

SEARCH OBJECTS: preserve the six existing collectible identities, their appearances, scene integration and broad regions from the supplied image, with the same proportional scale reduction. Do not add duplicate collectible designs in the expanded area. Do not make targets giant or highlight them. Existing collectible specification is for identity only (the picture is authoritative for current position): ${board.items}

OUTPUT: one full-bleed 16:9 3840x2160 illustrated board. No UI, labels, annotations, outlines marking targets, placeholder cutouts, designated hiding markers, or inserted personalized child. Do not redesign existing clothing or faces. The single meaningful change must be an unmistakably wider, shallower view with smaller figures and more surrounding activity, while preserving the source art style.`;
  writeFileSync(promptFile, prompt);
  revisions.push({ id: board.id, source, sourceSha256: createHash('sha256').update(readFileSync(source)).digest('hex'), input, promptFile, output: `${output}/${board.id}-4k.png` });
}
writeFileSync(`${output}/plan.json`, JSON.stringify({
  version: 'adventure-zoomout-20260914-v2', status: 'art-revision-only',
  model: 'gpt-image-2', size: '3840x2160', quality: 'high', requestedCalls: 6,
  childPlacementAllowed: false, hideAuthoringAllowed: false,
  previousCoordinatesInvalidForNewImages: true, boards: revisions,
}, null, 2));
console.log(`Prepared ${revisions.length} art-only edits; child/hide work remains paused.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

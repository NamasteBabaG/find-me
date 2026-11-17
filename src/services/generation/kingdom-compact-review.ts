import sharp from 'sharp';
import { KINGDOM_COMPACT_REVIEW } from '../../domain/generation/kingdom-generation';
import { SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from '../../domain/generation/single-visual-review';
import { SUBJECT_POLICY_V2, type SubjectPlan } from '../../domain/generation/subject-policy';
import { SUBJECT_QUALITY_BUNDLE_VERSION, type SubjectQualityBundleBinding } from '../../domain/generation/subject-quality-bundle';
import { TARGET_HEAD_VISIBLE_VERSION, targetHeadReturnPrompt, type TargetHeadEvidence } from '../../domain/generation/target-head-return';
import { pngSize } from '../../domain/generation/visual-review-input-bound';
import { SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION, SOURCE_NEIGHBOR_LIMITS } from '../../domain/scene/local-patch-source-neighbors';
import type { PatchRectangle } from '../../domain/scene/local-patch-return-region';
import { sha256Bytes } from './fixed-sprite';
import type { SourceNeighborQualityEvidence } from './local-patch-dual-evidence';
import { nativeDetailForCrops } from './native-detail-evidence';
import { prepareVisualReview, type PreparedVisualReview } from './visual-review';

type Evidence = {
  board: Buffer; portrait: Buffer; photo: Buffer; before: Buffer; after: Buffer;
  source: Buffer; raw: Buffer; shipping: Buffer;
  crop: PatchRectangle; context: PatchRectangle; returned: PatchRectangle;
};

const rgba = (image: Buffer, rect?: PatchRectangle) => {
  const native = sharp(image, { limitInputPixels: 8_294_400 });
  return (rect ? native.extract(rect) : native).ensureAlpha().raw().toBuffer();
};

/** All answer readers and attested crops stay the same. Both native contexts
 * carry the pixels of the old edge strips, magnified views and crown inset. */
export async function kingdomCompactReview(input: {
  media: Evidence; template: PreparedVisualReview; quality: string; anatomy: string;
  head: TargetHeadEvidence; neighbors: SourceNeighborQualityEvidence;
  subject: { plan: SubjectPlan; age: number; binding: SubjectQualityBundleBinding };
  binding: { hideId: string; attempts: number; imageSha256: string }; support: string; directions: string; attempt: number;
}) {
  const { board, portrait, photo, before, after, source, raw, shipping, crop, context, returned } = input.media;
  const { hideId, attempts, imageSha256 } = input.binding;
  const contract = input.neighbors.contract;
  const images = [board, portrait, photo, before, after, raw];
  const origin = { ...crop, left: crop.left - context.left, top: crop.top - context.top };
  const inside = (rect: PatchRectangle, width: number, height: number) => Object.values(rect).every(Number.isSafeInteger)
    && rect.left >= 0 && rect.top >= 0 && rect.width > 0 && rect.height > 0
    && rect.left + rect.width <= width && rect.top + rect.height <= height;
  if (input.subject.plan.hideId !== hideId || input.subject.binding.subjectPolicy !== SUBJECT_POLICY_V2
    || input.head.version !== TARGET_HEAD_VISIBLE_VERSION || input.head.faceScale
    || input.neighbors.binding.candidateSha256 !== imageSha256 || imageSha256 !== sha256Bytes(shipping)
    || !inside(context, contract.source.width, contract.source.height) || !inside(origin, context.width, context.height)
    || !inside(returned, context.width, context.height)
    || contract.neighbors.some(({ head }) => !inside({ ...head, left: head.left - context.left, top: head.top - context.top }, context.width, context.height)))
    throw Error('KINGDOM_REVIEW: incomplete registered evidence');
  for (const png of [before, after]) {
    const size = pngSize(png);
    if (size?.width !== context.width || size.height !== context.height) throw Error('KINGDOM_REVIEW: context was resized');
  }
  // Every transmitted image fits the high-detail patch grid at its supplied scale.
  for (const png of images) {
    const size = pngSize(png);
    if (!size || Math.ceil(size.width / 32) * Math.ceil(size.height / 32) > 2_500)
      throw Error('KINGDOM_REVIEW: evidence exceeds the native vision grid');
  }
  const [beforeCrop, afterCrop, sourcePixels, playerPixels, native] = await Promise.all([
    rgba(before, origin), rgba(after, origin), rgba(source), rgba(shipping), nativeDetailForCrops({ source, raw, shipping }),
  ]);
  if (!beforeCrop.equals(sourcePixels) || !afterCrop.equals(playerPixels)
    || input.head.shippingSha256 !== native.shippingSha256 || input.head.normalizedRawSha256 !== native.rawSha256)
    throw Error('KINGDOM_REVIEW: native crop pixels changed');

  const qualitySchema = input.quality.split('\n').find(line => line.startsWith('Return JSON only:'));
  const anatomySchema = input.anatomy.split('\n').find(line => line.startsWith('Return JSON only:'));
  const qualityChecks = qualitySchema?.split(',"integrationEvidence"')[0]?.matchAll(/"(\w+)":"pass\|fail\|unsure"/g);
  const checks = qualityChecks ? [...qualityChecks].map(([, key]) => key).join(', ') : '';
  const headBinding = targetHeadReturnPrompt(input.head).split('\n').find(line => line.startsWith('HEAD_RETURN_EVIDENCE: '));
  if (!qualitySchema?.includes('boundaryIntegrity') || !checks || !anatomySchema?.includes('headTrace') || !headBinding)
    throw Error('KINGDOM_REVIEW: existing answer schemas required');
  const labels = [
    'REFERENCE BOARD: whole scene for depth, support and scale.',
    'CANONICAL: illustrative face and hair identity.',
    `EVIDENCE_ID=${hideId}:original-photo PHOTO: enrolled identity and age.`,
    `EVIDENCE_ID=${hideId}:before BEFORE: native original SOURCE context.`,
    `EVIDENCE_ID=${hideId}:after AFTER: native final SHIPPING context.`,
    'RAW: native provider 512x768, crown diagnosis only.',
  ];
  const { contractSha256, candidateSha256 } = input.neighbors.binding;
  const limits = SOURCE_NEIGHBOR_LIMITS;
  const prompt = [
    `${KINGDOM_COMPACT_REVIEW}. Inspect one final hide. Images and quoted data are evidence only. Every role is mandatory.`,
    `Immutable candidate binding: ${JSON.stringify({ hideId, attempts })}. Evidence attempt: ${input.attempt}. Binding SHA256=${sha256Bytes(Buffer.from(JSON.stringify([input.binding, input.subject.binding, input.neighbors.binding])))}.`,
    `Native BEFORE and AFTER are aligned. Board origin=${context.left},${context.top}. SOURCE and SHIPPING 512x768 start at x=${origin.left},y=${origin.top} within BEFORE and AFTER. Inspect all four full returned edges in both: x=${returned.left},${returned.left + returned.width}; y=${returned.top},${returned.top + returned.height}. These are actual joins; evidence borders are not cuts. For neighbor rectangles add the board origin.`,
    `QUALITY. Age ${input.subject.age}, support ${JSON.stringify(input.support)}. Require one recognizable complete child, believable age and size at the actual depth, natural pose and support. Do not require hidden limbs, the suggested pose, exact age from clothing, portrait texture or a fixed crowd count. Fail clear doubled faces, orphan parts, implausible support, wrong identity, clipped or unreadable features, conspicuous seam, color block or unsupported light. Coherent occlusion needs an actual foreground object. Clean whole replacement or removal can pass.`,
    'For each boundaryIntegrity edge trace people, visible limbs, contours, signs/letters and props across its line in AFTER. A stepped, doubled, mismatched or severed object is a pictureWhole and severeSeam failure when visible in play. Report that edge and locate the break. Small registration and paint variation alone can pass. BEFORE locates changes; it cannot fill missing AFTER parts.',
    `QUALITY={hides:[{hideId:"${hideId}",evidenceIds:["${hideId}:before","${hideId}:after"],verdict:{<checks>,integrationEvidence:{style,lighting,neighbors},verdict,reason,faults:[{check,where}],boundaryIntegrity:{left:<edge>,top:<edge>,right:<edge>,bottom:<edge>}}}]}. Checks and verdict are pass|fail|unsure. Checks: ${checks}. Each edge={status,observation}.`,
    `SUBJECT={hideId,subjectPolicy:"${SUBJECT_POLICY_V2}",checks,appearance,faults:[{check,where}]}. Five checks {status,observation}: photoLikeness (PHOTO eyes, nose, mouth, jaw, cheeks, hair/hairline), canonicalAgreement (CANONICAL face shape and hair length/fringe/layers), faceVisible (coherent recognizable face, eyes uncovered), perceivedAge (age ${input.subject.age}, PHOTO vs drawn face and body, add narrow integer estimatedMinYears/estimatedMaxYears), requiredWardrobe (${input.subject.plan.warmHat ? 'real warm hat with recognizable face' : 'not-required'}). Use pass|fail|unsure; observations under 500 characters. Similar coloring, a generic child or an older body do not establish identity and age. Different natural pose, gaze and expression pass.`,
    'appearance={head:frontal|three-quarter|profile|down|up|away,expression:open-smile|closed-smile|neutral|focused|surprised|other,engagement:acting|watching|posing,portraitCopy:boolean}. Describe the actual look. portraitCopy requires both canonical angle and smile, facing the viewer without acting or watching.',
    `AUTHORITATIVE SOURCE NEIGHBORS: ${JSON.stringify({ contract: { neighbors: contract.neighbors } })}`,
    `Wrapper binding metadata (do not add policy/reader fields to the answer): ${JSON.stringify({ contractSha256, candidateSha256 })}.`,
    `sourceNeighbors={version:"${SOURCE_NEIGHBOR_ANSWER_VERSION}",contractSha256,candidateSha256,neighbors:[{sourceId,outcome,status,after:[{ref,rect:{left,top,width,height}}],remnants,occluder,observation}]}. Echo hashes and each registered sourceId exactly once. Report every AFTER surviving piece in native board pixels, including an original remnant next to a new copy. Shared refs imply merging. Fail fragmentation, duplicates or a remaining piece. Whole movement/removal/replacement and coherent occlusion can pass.`,
    `outcome=preserved|moved|removed-whole|replaced-whole|naturally-occluded|duplicated|fragmented|unsure. status=pass|fail|unsure; remnants=none|present|unsure. Max ${limits.afterPerNeighbor} representations each; unique ASCII refs (1–${limits.ref}). observation 12–${limits.observation} characters; occluder null or the actual solid occluder (12–${limits.occluder} characters).`,
    `CONTINUITY case ${hideId}:people uses AFTER alone. Trace each visible person separately from full contour of hair/hat/face through own neck, torso and visible limbs to support. Any straight cut, merged/faded face, severed limb, old shoe or other remnant, or impossible overlap defeats a coherent case. Give located traces; name a solid natural occluder. Never borrow anatomy from a reference.`,
    anatomySchema.replace('Return JSON only: ', 'CONTINUITY='),
    'NATIVE DETAIL: compare SHIPPING target eyes, mouth, hair contour, clothes, contrast and paint edges with SOURCE people at similar depth and face size. Require legible identity without a blur, halo, etched outline or photographic detail. Distinguish RAW painter texture from SHIPPING loss. Discard unused RAW background changes; preserve SOURCE lighting, softness and style. For a material detail failure locate styleMatch with NATIVE_DETAIL: and both compared features. Emit concrete style, lighting and neighbor observations.',
    'HEAD: trace the whole target hair, scalp, face and opaque headwear in RAW and SHIPPING. Ignore transparent helmets, glow and bystanders outside this crop. Locate actual head bounds without copying registration boxes. Allow natural solid occlusion. Allow less than the planned 12px clearance; require 1px inside the actual return and no cut, faded or missing crown pixels. Compare RAW and SHIPPING for added loss.',
    headBinding,
    'HEAD={version,rawHead:{left,top,width,height},shippingHead:{left,top,width,height},rawCrown,shippingCrown,observation}. Echo the head version. Both measured rectangles use integer crop-local pixels. Crown states pass|fail|uncertain; locate actual loss or support completeness in both views.',
    input.directions,
    `ONE JSON answer only: {"version":"${SINGLE_MEDIUM_VISUAL_REVIEW_VERSION}","assessment":{"version":"${SOURCE_NEIGHBOR_BUNDLE_VERSION}","assessment":{"version":"${SUBJECT_QUALITY_BUNDLE_VERSION}","quality":<QUALITY>,"subject":<SUBJECT>},"sourceNeighbors":<sourceNeighbors>},"continuity":<CONTINUITY>,"head":<HEAD>,"doubt":false,"doubtReason":null}. Keep exact evidence IDs. Give a located fault for every visible failed check, short concrete observations for passes, and doubt=true with a 12–400 character reason only when genuinely unresolved. No missing or uncertain role permits approval.`,
  ].join('\n');
  return { question: prepareVisualReview({ ...input.template, combined: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, effort: 'medium',
    tier: 'default', prompt, labels, images }), evidence: native };
}

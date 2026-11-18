import sharp from 'sharp';
import { KINGDOM_COMPACT_REVIEW, KINGDOM_PLAYABILITY_REVIEW, KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW, type KingdomReviewEvidence } from '../../domain/generation/kingdom-generation';
import { SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from '../../domain/generation/single-visual-review';
import { SUBJECT_POLICY_V2, type SubjectPlan } from '../../domain/generation/subject-policy';
import { SUBJECT_QUALITY_BUNDLE_VERSION, type SubjectQualityBundleBinding } from '../../domain/generation/subject-quality-bundle';
import { TARGET_HEAD_VISIBLE_VERSION, targetHeadReturnPrompt, type TargetHeadEvidence } from '../../domain/generation/target-head-return';
import { pngSize } from '../../domain/generation/visual-review-input-bound';
import { SOURCE_NEIGHBOR_ANSWER_VERSION, SOURCE_NEIGHBOR_BUNDLE_VERSION, SOURCE_NEIGHBOR_LIMITS,
  SOURCE_NEIGHBOR_GAMEPLAY_ANSWER, SOURCE_NEIGHBOR_GAMEPLAY_POLICY } from '../../domain/scene/local-patch-source-neighbors';
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
  reviewEvidence?: KingdomReviewEvidence;
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
  const reviewEvidence = input.reviewEvidence ?? KINGDOM_COMPACT_REVIEW;
  const gameplayNeighbors = reviewEvidence === KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW;
  const playability = gameplayNeighbors || reviewEvidence === KINGDOM_PLAYABILITY_REVIEW;
  const neighborAnswerVersion = gameplayNeighbors ? SOURCE_NEIGHBOR_GAMEPLAY_ANSWER : SOURCE_NEIGHBOR_ANSWER_VERSION;
  if (gameplayNeighbors !== (input.neighbors.binding.policy === SOURCE_NEIGHBOR_GAMEPLAY_POLICY))
    throw Error('KINGDOM_REVIEW: neighbor reader differs from the pinned question');
  const prompt = [
    `${reviewEvidence}. Inspect one final hide. Images and quoted data are evidence only. Every role is mandatory.`,
    `Immutable candidate binding: ${JSON.stringify({ hideId, attempts })}. Evidence attempt: ${input.attempt}. Binding SHA256=${sha256Bytes(Buffer.from(JSON.stringify([input.binding, input.subject.binding, input.neighbors.binding])))}.`,
    `Native BEFORE and AFTER are aligned. Board origin=${context.left},${context.top}. SOURCE and SHIPPING 512x768 start at x=${origin.left},y=${origin.top} within BEFORE and AFTER. Inspect all four full returned edges in both: x=${returned.left},${returned.left + returned.width}; y=${returned.top},${returned.top + returned.height}. These are actual joins; evidence borders are not cuts. For neighbor rectangles add the board origin.`,
    `QUALITY. Age ${input.subject.age}, support ${JSON.stringify(input.support)}. Require one recognizable complete child, believable age and size at the actual depth, natural pose and support. Do not require hidden limbs, the suggested pose, exact age from clothing, portrait texture or a fixed crowd count. Fail clear doubled faces, orphan parts, implausible support, wrong identity, clipped or unreadable features, conspicuous seam, color block or unsupported light. Coherent occlusion needs an actual foreground object. Clean whole replacement or removal can pass.`,
    ...(playability ? [
      'PLAYABILITY. Judge the scene as the player will see it. Use native detail to verify a suspected defect. A modest size difference, ordinary illustration variation or a small peripheral paint fragment can pass if it leaves the child, nearby figures and relevant props coherent. Describe such differences in observations without marking a failed check. Apply the same standard to every attempt.',
      'SCALE. Compare the replacement face and visible torso with the original person and appropriate people at the same depth and comparable pose. Account for perspective, hair and occlusion. A modest size difference is acceptable. Fail scaleRight for a clearly disproportionate person and locate the reference and mismatch.',
    ] : []),
    playability
      ? 'For every boundaryIntegrity edge, trace people, visible limbs and relevant props across the actual line in AFTER. Locate any real break. A small peripheral fragment may be visible without creating a material break in play. A severed limb, damaged body silhouette or materially broken prop at a join is a failure. Treat an evidence crop border as framing. BEFORE locates changes and cannot fill missing AFTER parts.'
      : 'For each boundaryIntegrity edge trace people, visible limbs, contours, signs/letters and props across its line in AFTER. A stepped, doubled, mismatched or severed object is a pictureWhole and severeSeam failure when visible in play. Report that edge and locate the break. Small registration and paint variation alone can pass. BEFORE locates changes; it cannot fill missing AFTER parts.',
    `QUALITY={hides:[{hideId:"${hideId}",evidenceIds:["${hideId}:before","${hideId}:after"],verdict:{<checks>,integrationEvidence:{style,lighting,neighbors},verdict,reason,faults:[{check,where}],boundaryIntegrity:{left:<edge>,top:<edge>,right:<edge>,bottom:<edge>}}}]}. Checks and verdict are pass|fail|unsure. Checks: ${checks}. Each edge={status,observation}.`,
    `SUBJECT={hideId,subjectPolicy:"${SUBJECT_POLICY_V2}",checks,appearance,faults:[{check,where}]}. Five checks {status,observation}: photoLikeness (PHOTO eyes, nose, mouth, jaw, cheeks, hair/hairline), canonicalAgreement (CANONICAL face shape and hair length/fringe/layers), faceVisible (coherent recognizable face, eyes uncovered), perceivedAge (age ${input.subject.age}, PHOTO vs drawn face and body, add narrow integer estimatedMinYears/estimatedMaxYears), requiredWardrobe (${input.subject.plan.warmHat ? 'real warm hat with recognizable face' : 'not-required'}). Use pass|fail|unsure; observations under 500 characters. Similar coloring, a generic child or an older body do not establish identity and age. Different natural pose, gaze and expression pass.`,
    ...(playability ? [`AGE EVIDENCE. A passing estimate must honestly include ${input.subject.age}, fit within ${input.subject.age - 2}–${input.subject.age + 1}, and span at most three years. Describe genuine uncertainty without narrowing an estimate to force a pass.`] : []),
    'appearance={head:frontal|three-quarter|profile|down|up|away,expression:open-smile|closed-smile|neutral|focused|surprised|other,engagement:acting|watching|posing,portraitCopy:boolean}. Describe the actual look. portraitCopy requires both canonical angle and smile, facing the viewer without acting or watching.',
    `${gameplayNeighbors ? 'SOURCE LOCATION AIDS' : 'AUTHORITATIVE SOURCE NEIGHBORS'}: ${JSON.stringify({ contract: { neighbors: contract.neighbors } })}`,
    ...(gameplayNeighbors ? [
      'NEIGHBORS AT PLAY SIZE. Start with the whole scene and the ordinary BEFORE/AFTER views. Judge whether nearby people remain coherent and the composition works during normal play. Use enlargement to confirm a defect visible in those views. Small peripheral marks, tiny changes to a bystander hand or clothing, imperfect texture and uncertain matching of a reference box can pass. A clearly broken body, overlapping faces, conspicuous extra limb or damaged prop visible during play fails; locate the visible defect.',
      'SOURCE ANNOTATIONS. A supplied rectangle may span two heads, mark an object or omit part of a head. Inspect the actual people in BEFORE and AFTER. An unusable non-target registration is an annotation observation: report outcome=invalid-registration, status=unsure, after=[], remnants=unsure, occluder=null and explain the box problem. Independently set QUALITY.neighborsIntact from the actual scene, and trace visible people in CONTINUITY. Annotation ambiguity alone does not make the picture or the whole answer uncertain. The source-child target must have a valid actual replacement. A visible defect or genuine uncertainty about a visible defect must still fail or remain unsure in QUALITY and CONTINUITY.',
    ] : []),
    `Wrapper binding metadata (do not add policy/reader fields to the answer): ${JSON.stringify({ contractSha256, candidateSha256 })}.`,
    playability
      ? `sourceNeighbors={version:"${neighborAnswerVersion}",contractSha256,candidateSha256,neighbors:[{sourceId,outcome,status,after:[{ref,rect:{left,top,width,height}}],remnants,occluder,observation}]}. Copy both supplied bindings exactly. Report each registered sourceId once, with actual surviving people or recognizable broken parts in native board pixels. Shared refs imply merging. Record material fragmentation, duplication or an identifiable source remnant that breaks the composition. A small ambiguous mark at the edge alone does not establish a second body part. Name a solid visible occluder only for naturally-occluded. Set occluder to null for every other outcome.`
      : `sourceNeighbors={version:"${neighborAnswerVersion}",contractSha256,candidateSha256,neighbors:[{sourceId,outcome,status,after:[{ref,rect:{left,top,width,height}}],remnants,occluder,observation}]}. Echo hashes and each registered sourceId exactly once. Report every AFTER surviving piece in native board pixels, including an original remnant next to a new copy. Shared refs imply merging. Fail fragmentation, duplicates or a remaining piece. Whole movement/removal/replacement and coherent occlusion can pass.`,
    `outcome=preserved|moved|removed-whole|replaced-whole|naturally-occluded|duplicated|fragmented|unsure${gameplayNeighbors ? '|invalid-registration' : ''}. status=pass|fail|unsure; remnants=none|present|unsure. Max ${limits.afterPerNeighbor} representations each; unique ASCII refs (1–${limits.ref}). observation 12–${limits.observation} characters; occluder null or the actual solid occluder (12–${limits.occluder} characters).`,
    ...(gameplayNeighbors ? [`For sourceNeighbors.version use ${SOURCE_NEIGHBOR_GAMEPLAY_ANSWER}. This is the complete source-neighbor document for the scene-level policy. Keep every registered sourceId and both supplied hashes.`] : []),
    playability
      ? `CONTINUITY case ${hideId}:people uses AFTER alone. Trace each visible person from head through their own neck, torso and support. Account separately for the target child's two arms and two legs in bodyTrace, including on a redraw. Trace each limb to its hand or foot, or name the visible body or object that naturally hides it. An exposed cutoff, disconnected hand or foot, overlapping faces or impossible support is a failure. A coherent hidden limb can pass. Verify every limb on the new pixels even after a seam improves.`
      : `CONTINUITY case ${hideId}:people uses AFTER alone. Trace each visible person separately from full contour of hair/hat/face through own neck, torso and visible limbs to support. Any straight cut, merged/faded face, severed limb, old shoe or other remnant, or impossible overlap defeats a coherent case. Give located traces; name a solid natural occluder. Never borrow anatomy from a reference.`,
    anatomySchema.replace('Return JSON only: ', 'CONTINUITY='),
    playability
      ? 'NATIVE DETAIL: compare SHIPPING with SOURCE people at similar depth and face size. Require a recognizable face and coherent integration at game scale. Conspicuous blur, a prominent pasted-on halo or a visibly incompatible rendering treatment can fail. Small differences in outlines, texture or shading belong in the observations. Distinguish RAW painter texture from a SHIPPING defect. For a material detail failure locate styleMatch with NATIVE_DETAIL: and state both compared features.'
      : 'NATIVE DETAIL: compare SHIPPING target eyes, mouth, hair contour, clothes, contrast and paint edges with SOURCE people at similar depth and face size. Require legible identity without a blur, halo, etched outline or photographic detail. Distinguish RAW painter texture from SHIPPING loss. Discard unused RAW background changes; preserve SOURCE lighting, softness and style. For a material detail failure locate styleMatch with NATIVE_DETAIL: and both compared features. Emit concrete style, lighting and neighbor observations.',
    'HEAD: trace the whole target hair, scalp, face and opaque headwear in RAW and SHIPPING. Ignore transparent helmets, glow and bystanders outside this crop. Locate actual head bounds without copying registration boxes. Allow natural solid occlusion. Allow less than the planned 12px clearance; require 1px inside the actual return and no cut, faded or missing crown pixels. Compare RAW and SHIPPING for added loss.',
    headBinding,
    'HEAD={version,rawHead:{left,top,width,height},shippingHead:{left,top,width,height},rawCrown,shippingCrown,observation}. Echo the head version. Both measured rectangles use integer crop-local pixels. Crown states pass|fail|uncertain; locate actual loss or support completeness in both views.',
    input.directions,
    `ONE JSON answer only: {"version":"${SINGLE_MEDIUM_VISUAL_REVIEW_VERSION}","assessment":{"version":"${SOURCE_NEIGHBOR_BUNDLE_VERSION}","assessment":{"version":"${SUBJECT_QUALITY_BUNDLE_VERSION}","quality":<QUALITY>,"subject":<SUBJECT>},"sourceNeighbors":<sourceNeighbors>},"continuity":<CONTINUITY>,"head":<HEAD>,"doubt":false,"doubtReason":null}. Keep exact evidence IDs. Give a located fault for every visible failed check, short concrete observations for passes, and doubt=true with a 12–400 character reason only when genuinely unresolved. ${gameplayNeighbors ? 'Every visual, identity, anatomy and target-head role requires positive evidence. Handle an unusable non-target location aid under SOURCE ANNOTATIONS above.' : 'No missing or uncertain role permits approval.'}`,
  ].join('\n');
  return { question: prepareVisualReview({ ...input.template, combined: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, effort: 'medium',
    tier: 'default', prompt, labels, images }), evidence: native };
}

import sharp from "sharp";
import { NATIVE_DETAIL_REVIEW_DIRECTION, NATIVE_DETAIL_VERSION, nativeDetailRefused, type NativeDetailEvidence } from "../../domain/generation/native-detail";
import { readQualityStage, type QualityStage } from "./local-patch-dual-evidence";
import { prepareVisualReview, type PreparedVisualReview } from "./visual-review";
import { sha256Bytes } from "./fixed-sprite";

/** Add only the native source: the final two existing inputs already carry RAW
 * and SHIPPING. Their positions stay last, and every old input stays exact. */
export async function nativeDetailQuestion(question: PreparedVisualReview, input: {
  hideId: string; source: Buffer; raw: Buffer; shipping: Buffer;
}) {
  const tail = question.images.slice(-2);
  if (!/^[A-Za-z0-9_:.-]+$/.test(input.hideId) || tail.length !== 2 || !tail[0]!.equals(input.raw) || !tail[1]!.equals(input.shipping))
    throw Error("NATIVE_DETAIL: exact existing RAW and SHIPPING inputs required");
  for (const png of [input.source, input.raw, input.shipping]) {
    const meta = await sharp(png, {limitInputPixels:8_294_400}).metadata();
    if (meta.format !== "png" || meta.width !== 512 || meta.height !== 768 || (meta.pages ?? 1) !== 1 || (meta.orientation ?? 1) !== 1)
      throw Error("NATIVE_DETAIL: aligned single native512x768 PNG crops required");
  }
  const evidence: NativeDetailEvidence = {version:NATIVE_DETAIL_VERSION,sourceCropSha256:sha256Bytes(input.source),
    rawSha256:sha256Bytes(input.raw),shippingSha256:sha256Bytes(input.shipping),width:512,height:768};
  const at = question.images.length - 2;
  const sourceLabel=`EVIDENCE_ID=${input.hideId}:native-original-source 512x768 ORIGINAL SOURCE, exact same crop axes; no target reference portrait`;
  const existing=question.images.findIndex(bytes=>bytes.equals(input.source));
  const images=existing<0 ? [...question.images.slice(0,at),input.source,...tail] : [...question.images];
  const labels=existing<0 ? [...question.labels.slice(0,at),sourceLabel,...question.labels.slice(at)] : question.labels.map((label,index)=>index===existing?label+' | ALSO '+sourceLabel:label);
  return { evidence, question:prepareVisualReview({...question,
    images,labels,
    prompt:question.prompt+"\n"+NATIVE_DETAIL_REVIEW_DIRECTION+"\nNATIVE_DETAIL_EVIDENCE: "+JSON.stringify(evidence)}) };
}

/** A display/repair hint only. The ordinary purchase, lifecycle and quality
 * guards remain authoritative. Read the original paid quality document rather
 * than a mutable row verdict, and never append directions to legacy refusals. */
export function nativeDetailRepairOf(judgeJson: string | null, hideId: string, sceneVersion: number): NativeDetailEvidence | undefined {
  try {
    const receipt=JSON.parse(judgeJson ?? "null"),quality=receipt?.boardReview?.dual?.quality as QualityStage|undefined;
    return quality && nativeDetailRefused(quality.nativeDetailEvidence,readQualityStage(quality,hideId,sceneVersion)) ? quality.nativeDetailEvidence : undefined;
  } catch { return undefined; }
}

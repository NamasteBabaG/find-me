import { NATIVE_DETAIL_PAINT_DIRECTION, NATIVE_DETAIL_VERSION } from "../../domain/generation/native-detail";
import type { SubjectRenderDirection } from "./local-patch-render";
import { sha256Bytes } from "./fixed-sprite";

type Direction = SubjectRenderDirection & {
  readonly legacy?: SubjectRenderDirection | readonly SubjectRenderDirection[];
  readonly nativeDetailPolicy?: typeof NATIVE_DETAIL_VERSION;
};

/** Prospective input only. The existing purchase selector matches the exact
 * old fingerprint against legacy directions before replaying a started key.
 * Original photos, portraits, wardrobe, age, placement and quality stay exact. */
export function nativeDetailSubjectDirection(direction: Direction | undefined): Direction | undefined {
  if (!direction || direction.nativeDetailPolicy === NATIVE_DETAIL_VERSION) return direction;
  const text=direction.text+"\n\n"+NATIVE_DETAIL_PAINT_DIRECTION;
  const legacy=direction.legacy ? Array.isArray(direction.legacy) ? direction.legacy : [direction.legacy] : [];
  return {...direction,text,sha256:sha256Bytes(Buffer.from(JSON.stringify([text,direction.wardrobe ?? null,direction.photoSha256,direction.policySha256,direction.quality]))),
    nativeDetailPolicy:NATIVE_DETAIL_VERSION,legacy:[direction,...legacy]};
}

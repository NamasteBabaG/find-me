import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { withFreshAssetUrls } from "@/services/asset.service";
import { ownerPassport, PassportAccessError } from "@/services/passport.service";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { LinkButton } from "@/ui/Button";
import { OwnerPassport } from "@/ui/passport/OwnerPassport";
import { PassportSharing } from "@/ui/passport/PassportSharing";

export const metadata = { robots: { index: false, follow: false } };
export default async function PassportPage({ params }: { params: Promise<{ childId: string }> }) {
  await requireQaAccess();
  const [user, { childId }, { t }] = await Promise.all([currentUser(), params, getI18n()]);
  if (!user) redirect("/family");
  let book;
  // The child's sticker is a game picture: signed like the game's own, so the browser keeps it between visits.
  try { book = withFreshAssetUrls(getContainer(), await ownerPassport(getContainer().db, user.id, childId)); }
  catch (error) { if (error instanceof PassportAccessError) notFound(); throw error; }
  return <main className="passport-view">
    {/* Back to where the passport was opened from: this child's adventures. */}
    <nav className="passport-view__nav"><LinkButton href={`/family/${childId}`} variant="ghost"><span className="fm-btn__arrow fm-btn__arrow--back" aria-hidden>➜</span>{tf(t.family.open, { name: book.name })}</LinkButton></nav>
    <OwnerPassport initial={book} childId={childId} />
    <PassportSharing childId={childId} />
  </main>;
}

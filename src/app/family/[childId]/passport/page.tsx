import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { ownerPassport, PassportAccessError } from "@/services/passport.service";
import { getI18n } from "@/i18n/server";
import { LinkButton } from "@/ui/Button";
import { OwnerPassport } from "@/ui/passport/OwnerPassport";
import { PassportSharing } from "@/ui/passport/PassportSharing";

export const metadata = { robots: { index: false, follow: false } };
export default async function PassportPage({ params }: { params: Promise<{ childId: string }> }) {
  await requireQaAccess();
  const [user, { childId }, { t }] = await Promise.all([currentUser(), params, getI18n()]);
  if (!user) redirect("/family");
  let book;
  try { book = await ownerPassport(getContainer().db, user.id, childId); }
  catch (error) { if (error instanceof PassportAccessError) notFound(); throw error; }
  return <main className="passport-view">
    <nav className="passport-view__nav"><LinkButton href={`/family/${childId}`} variant="ghost">{t.family.back}</LinkButton><span aria-hidden="true">FIND ME WORLDS</span></nav>
    <OwnerPassport initial={book} childId={childId} />
    <PassportSharing childId={childId} />
  </main>;
}

import { redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { PhotoUploader } from "./PhotoUploader";
import { getContainer } from "@/services/container";
import { worldPurchaseDraftHref, worldPurchaseHref, worldPurchaseReturnHref, worldPurchaseSignInHref } from "@/domain/world-purchase";
import { worldBySlug } from "@/services/world-catalog.service";
import { pick } from "@/i18n";
import { LinkButton } from "@/ui/Button";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.steps[1] };
}

export default async function CreatePhotoPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const params = await searchParams;
  const [user, draft, { t, locale }] = await Promise.all([currentUser(), currentDraft(params.game), getI18n()]);
  if (params.game && !user) redirect(worldPurchaseSignInHref(worldPurchaseDraftHref(params.game, "photo")));
  if (!draft?.childProfile) redirect("/create");
  const name = draft.childProfile.displayName;
  const hasPhoto = Boolean(draft.childProfile.originalPhotoAssetId);
  const rejectedCode = draft.status === "PHOTO_REJECTED" ? (draft.lastError?.split(":")[0] ?? null) : null;
  const intent = user && draft.ownerId === user.id ? await getContainer().db.childWorldPurchase.findUnique({ where: { activeGameId: draft.id } }) : null;
  const purchase = intent && user && intent.ownerId === user.id && intent.familyChildId === draft.familyChildId ? intent : null;
  const suffix = `?game=${encodeURIComponent(draft.id)}`;
  const backHref = purchase ? worldPurchaseHref(purchase.familyChildId, purchase.worldSlug, purchase.returnGameId) : null;
  return (
    <CreateFrame step={1} title={tf(t.create.photo.title, { name })} user={user} isAdmin={isAdminEmail(user?.email)}>
      {purchase ? <div className="fm-stack fm-stack--2"><p className="fm-lead fm-center">{tf(t.worldPurchase.photoContext, { name, world: pick(worldBySlug(purchase.worldSlug).name, locale) })}</p><p className="fm-hint fm-center">{t.worldPurchase.photoNeeded}</p></div> : null}
      <PhotoUploader childName={name} hasPhoto={hasPhoto} rejectedCode={rejectedCode} {...(purchase ? { endpoint: `/api/drafts/photo${suffix}`, nextHref: `/checkout${suffix}` } : {})} />
      {backHref ? <div className="fm-center"><LinkButton href={worldPurchaseReturnHref(purchase!.familyChildId, purchase!.returnGameId)} variant="ghost">{t.worldPurchase.back}</LinkButton></div> : null}
    </CreateFrame>
  );
}

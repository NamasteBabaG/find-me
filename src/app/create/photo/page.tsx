import { redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { PhotoUploader } from "./PhotoUploader";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.steps[1] };
}

export default async function CreatePhotoPage() {
  const [user, draft, { t }] = await Promise.all([currentUser(), currentDraft(), getI18n()]);
  if (!draft?.childProfile) redirect("/create");
  const name = draft.childProfile.displayName;
  const hasPhoto = Boolean(draft.childProfile.originalPhotoAssetId);
  const rejectedCode = draft.status === "PHOTO_REJECTED" ? (draft.lastError?.split(":")[0] ?? null) : null;
  return (
    <CreateFrame step={1} title={tf(t.create.photo.title, { name })} lead={t.create.photo.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <PhotoUploader childName={name} hasPhoto={hasPhoto} rejectedCode={rejectedCode} />
    </CreateFrame>
  );
}

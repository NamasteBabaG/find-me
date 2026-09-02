import { redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { CreateFrame } from "../CreateLayout";
import { currentDraft } from "../actions";
import { PhotoUploader } from "./PhotoUploader";

export const metadata = { title: "תמונה" };

export default async function CreatePhotoPage() {
  const [user, draft] = await Promise.all([currentUser(), currentDraft()]);
  if (!draft?.childProfile) redirect("/create");
  const hasPhoto = Boolean(draft.childProfile.originalPhotoAssetId);
  return (
    <CreateFrame step={1} title={`תמונה של ${draft.childProfile.displayName}`} lead="תמונה אחת ברורה. אנחנו נהפוך אותה לסטיקר מאויר שמתחבא בעולמות." user={user} isAdmin={isAdminEmail(user?.email)}>
      <PhotoUploader childName={draft.childProfile.displayName} hasPhoto={hasPhoto} rejectedReason={draft.status === "PHOTO_REJECTED" ? draft.lastError : null} />
    </CreateFrame>
  );
}

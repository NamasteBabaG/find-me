import { currentUser, isAdminEmail } from "@/lib/server/session";
import { CreateFrame } from "./CreateLayout";
import { NameForm } from "./NameForm";
import { currentDraft } from "./actions";

export const metadata = { title: "מי מתחבא?" };

export default async function CreateNamePage() {
  const [user, draft] = await Promise.all([currentUser(), currentDraft()]);
  return (
    <CreateFrame step={0} title="מי מתחבא?" lead="השם יופיע על המשחק ובבועות הדיבור. לא צריך שום דבר נוסף." user={user} isAdmin={isAdminEmail(user?.email)}>
      <NameForm initialName={draft?.childProfile?.displayName ?? ""} />
    </CreateFrame>
  );
}

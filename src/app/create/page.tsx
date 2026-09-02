import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { CreateFrame } from "./CreateLayout";
import { NameForm } from "./NameForm";
import { currentDraft } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.name.title };
}

export default async function CreateNamePage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const [user, draft, params, { t }] = await Promise.all([currentUser(), currentDraft(), searchParams, getI18n()]);
  const initialName = draft?.childProfile?.displayName ?? (params.name ?? "").slice(0, 24);
  return (
    <CreateFrame step={0} title={t.create.name.title} lead={t.create.name.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <NameForm initialName={initialName} />
    </CreateFrame>
  );
}

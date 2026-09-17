import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { CreateFrame } from "./CreateLayout";
import { NameForm } from "./NameForm";
import { currentDraft } from "./actions";
import { getContainer } from "@/services/container";
import { listFamilyChildren } from "@/services/family.service";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.name.title };
}

export default async function CreateNamePage({ searchParams }: { searchParams: Promise<{ name?: string; child?: string }> }) {
  const [user, draft, params, { t }] = await Promise.all([currentUser(), currentDraft(), searchParams, getI18n()]);
  const initialName = draft?.childProfile?.displayName ?? (params.name ?? "").slice(0, 24);
  const children = user ? await listFamilyChildren(getContainer().db, user.id) : [];
  const preferred = params.child === "new" ? "" : params.child ?? draft?.familyChildId ?? "";
  const initialChildId = children.some(child => child.id === preferred) ? preferred : "";
  return (
    <CreateFrame step={0} title={t.create.name.title} lead={t.create.name.lead} user={user} isAdmin={isAdminEmail(user?.email)}>
      <NameForm initialName={params.child === "new" ? "" : initialName} initialAge={params.child ? null : draft?.childProfile?.ageYears} children={children} initialChildId={initialChildId} fresh={Boolean(params.child)} />
    </CreateFrame>
  );
}

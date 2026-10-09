import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { CreateFrame, CreationPrelaunch } from "./CreateLayout";
import { NameForm } from "./NameForm";
import { currentDraft } from "@/lib/server/current-draft";
import { getContainer } from "@/services/container";
import { listFamilyChildren } from "@/services/family.service";
import { purchasingEnabled } from "@/lib/purchasing";
import { searchLevelQuestion } from "@/services/create-flow.service";
import { isSearchLevel } from "@/domain/search-level";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.name.title };
}

export default async function CreateNamePage({ searchParams }: { searchParams: Promise<{ name?: string; child?: string }> }) {
  if (!purchasingEnabled()) return <CreationPrelaunch />;
  const [user, draft, params, { t }] = await Promise.all([currentUser(), currentDraft(), searchParams, getI18n()]);
  const initialName = draft?.childProfile?.displayName ?? (params.name ?? "").slice(0, 24);
  const c = getContainer();
  const children = user ? await listFamilyChildren(c.db, user.id) : [];
  const preferred = params.child === "new" ? "" : params.child ?? draft?.familyChildId ?? "";
  const initialChildId = children.some(child => child.id === preferred) ? preferred : "";
  // The same question the save will ask: this draft's, or a new one for a fresh adventure.
  const levels = await searchLevelQuestion(c, params.child ? null : draft);
  const savedLevel = params.child ? null : draft?.searchLevel;
  return (
    <CreateFrame step={0} title={t.create.name.title} user={user} isAdmin={isAdminEmail(user?.email)}>
      <NameForm initialName={params.child === "new" ? "" : initialName} initialAge={params.child ? null : draft?.childProfile?.ageYears} children={children} initialChildId={initialChildId} fresh={Boolean(params.child)}
        levelChoice={levels.shown} initialLevel={isSearchLevel(savedLevel) ? savedLevel : null} />
    </CreateFrame>
  );
}

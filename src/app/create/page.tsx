import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { CreateFrame, CreationPrelaunch } from "./CreateLayout";
import { NameForm } from "./NameForm";
import { currentDraft } from "@/lib/server/current-draft";
import { getContainer } from "@/services/container";
import { listFamilyChildren } from "@/services/family.service";
import { purchasingEnabled } from "@/lib/purchasing";
import { searchLevelTerms } from "@/services/create-flow.service";
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
  // The same terms the save will apply: this draft's, or a new one for a fresh adventure.
  const continuing = params.child ? null : draft;
  const levels = await searchLevelTerms(c, continuing);
  // Choosing another child in the form starts a new draft on save (the action drops a draft
  // that already has a different child), so the form also needs a new draft's terms.
  const fresh = continuing?.childProfileId ? await searchLevelTerms(c, null) : levels;
  const savedLevel = continuing?.searchLevel;
  return (
    <CreateFrame step={0} title={t.create.name.title} user={user} isAdmin={isAdminEmail(user?.email)}>
      <NameForm initialName={params.child === "new" ? "" : initialName} initialAge={params.child ? null : draft?.childProfile?.ageYears} children={children} initialChildId={initialChildId} fresh={Boolean(params.child)}
        levelChoice={levels.asked} freshLevelChoice={fresh.asked} initialLevel={isSearchLevel(savedLevel) ? savedLevel : null}
        draftChild={continuing?.childProfileId ? { familyChildId: continuing.familyChildId ?? "" } : null} />
    </CreateFrame>
  );
}

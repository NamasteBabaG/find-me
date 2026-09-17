"use server";
import { redirect } from "next/navigation";
import { currentUser, setDraftCookie } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { familyDraftToResume } from "@/services/family.service";

export async function resumeFamilyDraft(form: FormData) {
  await requireQaAccess();
  const user = await currentUser();
  if (!user) redirect("/family");
  const draft = await familyDraftToResume(getContainer().db, user.id, String(form.get("gameId") ?? ""));
  if (!draft?.draftToken) redirect("/family");
  await setDraftCookie(draft.draftToken);
  redirect("/create");
}

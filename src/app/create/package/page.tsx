
import { creationDraftHref } from "@/domain/creation-draft";
import { redirect } from "next/navigation";

/**
 * There is no package step any more (Guy, 2026-11-18): a new adventure always
 * starts with one world, and choosing it settles the package (`selectWorlds`).
 * The address stays so an old link or a back button lands on the worlds step.
 */
export default async function CreatePackagePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const params = await searchParams;
  redirect(creationDraftHref("scenes", params?.draft));
}

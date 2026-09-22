import { notFound } from "next/navigation";
import { currentAdmin } from "./session";

/** Layouts are not an authorization boundary for independently rendered pages. */
export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}

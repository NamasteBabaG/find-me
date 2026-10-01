import { z } from "zod";

/** Public facts only. Never derive contact details from an admin/login address. */
export function businessProfile(values: NodeJS.ProcessEnv = process.env) {
  const text = (key: string) => values[key]?.trim() || null;
  const email = z.string().email().safeParse(text("SUPPORT_EMAIL"));
  const profile = {
    name: text("LEGAL_BUSINESS_NAME"),
    number: text("LEGAL_BUSINESS_NUMBER"), address: text("LEGAL_BUSINESS_ADDRESS"),
    email: email.success ? email.data : null,
    phone: text("SUPPORT_PHONE"), hours: text("SUPPORT_HOURS"),
  };
  return { ...profile, complete: !!(profile.name && profile.number && profile.address && profile.email && profile.phone) };
}

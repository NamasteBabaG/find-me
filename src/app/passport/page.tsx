import type { Metadata } from "next";
import { SharedPassport } from "@/ui/passport/SharedPassport";
import { requireQaAccess } from "@/lib/server/qa-access";

export const metadata: Metadata = { title: "Find Me Worlds — Passport", description: "Little discoveries. Big adventures.", robots: { index: false, follow: false, noarchive: true }, referrer: "no-referrer", openGraph: { title: "Find Me Worlds", description: "Little discoveries. Big adventures.", images: [] } };
export default async function PassportPage() { await requireQaAccess(); return <SharedPassport />; }

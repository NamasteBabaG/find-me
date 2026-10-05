import type { Metadata } from "next";
import { requireQaAccess } from "@/lib/server/qa-access";
import { FriendPlay } from "@/ui/friends/FriendPlay";

export const metadata: Metadata = { title: "Find Me Worlds", robots: { index: false, follow: false, noarchive: true }, referrer: "no-referrer",
  openGraph: { title: "Find Me Worlds", description: "Find Me Worlds", images: [] } };
export default async function FriendsPage() { await requireQaAccess(); return <FriendPlay />; }

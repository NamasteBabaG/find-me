import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { isLiveShop } from "@/lib/env";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { privateReviewRoot } from "@/lib/server/private-review-root";
import { parseGameConfig } from "@/domain/game/config";
import { GameShell } from "@/game/components/GameShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "בדיקת בורדים פרטית (dev)", robots: { index: false, follow: false } };

const CONFIG = () => path.join(privateReviewRoot(), "private-review-config.json");

/**
 * The board-conditioned boards in the REAL player.
 *
 * This mounts the same GameShell the paid player link mounts, on the config the
 * player adapter produced, so what is judged here is the actual game and not a
 * gallery of crops. It is not a released game: the assets are served by the
 * gated dev route, nothing is written to the database, and the live shop 404s.
 */
export default async function PrivateReviewPage() {
  if (isLiveShop()) notFound();
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const raw = await readFile(CONFIG(), "utf8").catch(() => null);
  if (!raw) {
    return (
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3">
        <h1>אין עדיין משחק פרטי</h1>
        <p className="fm-lead">
          הריצו <code>npx tsx scripts/board-conditioned-private-game.ts --runs=&lt;run-id&gt;</code> כדי לבנות אותו.
        </p>
      </main>
    );
  }
  // The build writes `/private/<board>/<file>.png`; only this gated route may serve them.
  const config = parseGameConfig(raw.replaceAll("\"/private/", "\"/api/dev/private-review/"));
  return <GameShell key={config.locale} config={config} parentZoneHref="/dev/private-review" />;
}

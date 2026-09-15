import { notFound } from "next/navigation";
import { publicBeachDemo } from "../../../../content/demo/beach-v1";
import { GameConfigSchema } from "@/domain/game/config";
import { GameShell } from "@/game/components/GameShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Independent pilot — local interaction review", robots: { index: false, follow: false } };

/** Public demo artwork only; no private child, database, account or generator.
 * Opt-in development route, never an available world or production game. */
export default async function IndependentPilotReview({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.INDEPENDENT_PILOT_REVIEW !== "1") notFound();
  const { lang } = await searchParams;
  const locale = lang === "en" ? "en" : "he";
  const config = GameConfigSchema.parse({
    ...publicBeachDemo(locale),
    // These supplied demos have distinct names/book content: they are separate
    // review games, not a mutable translation of a delivered frozen book.
    gameId: `local-independent-pilot-20260915-${locale}`,
    playPolicy: "independent-worlds-v1",
  });
  return <GameShell config={config} skipGift telemetry={false} />;
}

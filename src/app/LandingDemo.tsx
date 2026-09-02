"use client";

import dynamic from "next/dynamic";
import type { GameConfig } from "@/domain/game/config";

const GameShell = dynamic(() => import("@/game/components/GameShell").then((m) => m.GameShell), {
  ssr: false,
  loading: () => <div className="fm-skeleton" style={{ position: "absolute", inset: 0 }} aria-hidden />,
});

/** The landing demo is the real renderer with a demo config (no DB, no photo). */
export function LandingDemo({ config }: { config: GameConfig }) {
  return <GameShell config={config} demo />;
}

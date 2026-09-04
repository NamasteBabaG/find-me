"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gameWorlds, scenesOfWorld, type GameConfig, type PlayWorld } from "@/domain/game/config";
import { sceneProgress, type GameProgress } from "@/domain/game/progress";
import { nodeStates, type NodeState } from "@/domain/world";
import { useGameText } from "../i18n";
import { IslandGrid } from "./IslandGrid";

interface Props {
  config: GameConfig;
  /** Which journey to draw. Defaults to the first, for a one-world game. */
  world?: PlayWorld | null;
  progress: GameProgress;
  onOpen: (slug: string) => void;
  onPassport: () => void;
  /** Back to the hub. Absent when the game has only one world. */
  onWorlds?: (() => void) | null;
  demo?: boolean;
  /** The board just finished: the marker travels from it to the next one. */
  travelFrom?: string | null;
  onTravelDone?: () => void;
}

/** Roughly the brief's 1.2–1.8s, and skippable. */
const TRAVEL_MS = 1500;

/**
 * The world map: one painted illustration, nine destinations, and the child's
 * own marker walking the route between them.
 *
 * The art is scenery. Every node, label and the marker is a DOM layer on top,
 * so they respond to progress, language and direction — and so the map is also
 * an ordered list of nine buttons for anyone using a keyboard or a screen
 * reader. A game composed before worlds existed falls back to the island grid.
 */
export function WorldMap({ config, world: shown, progress, onOpen, onPassport, onWorlds, demo, travelFrom, onTravelDone }: Props) {
  const world = shown ?? gameWorlds(config)[0];
  if (!world) return <IslandGrid config={config} progress={progress} onOpen={onOpen} onPassport={onPassport} demo={demo} />;
  return <WorldMapView config={config} world={world} progress={progress} onOpen={onOpen} onPassport={onPassport} onWorlds={onWorlds} demo={demo} travelFrom={travelFrom} onTravelDone={onTravelDone} />;
}

function WorldMapView({ config, world, progress, onOpen, onPassport, onWorlds, demo, travelFrom, onTravelDone }: Props & { world: PlayWorld }) {
  const { g, tf } = useGameText();
  // Only this world's boards. Counting the whole game against nine nodes is
  // how a two-world game reported 10/9 — and how world two's map lit up
  // because world one had been finished.
  const mine = useMemo(() => scenesOfWorld(config, world.slug), [config, world.slug]);
  const completed = useMemo(() => mine.filter((s) => sceneProgress(progress, s.slug).completed).map((s) => s.slug), [mine, progress]);
  const states = useMemo(() => nodeStates(world, { completedBoards: completed }), [world.nodes, completed]);
  const boards = useMemo(() => new Map(mine.map((s) => [s.slug, s])), [mine]);
  const done = completed.length;
  const total = world.nodes.length;

  // The marker's position is saved progress; the travel is only its presentation.
  const marker = world.nodes.find((n) => states[n.boardSlug] === "current") ?? world.nodes[world.nodes.length - 1]!;
  const from = travelFrom ? world.nodes.find((n) => n.boardSlug === travelFrom) : undefined;
  const [travelling, setTravelling] = useState(Boolean(from));
  const reduced = usePrefersReducedMotion();
  const doneRef = useRef(onTravelDone);
  doneRef.current = onTravelDone;

  useEffect(() => {
    if (!from) return;
    if (reduced) {
      // No journey animation: the marker is simply already there.
      setTravelling(false);
      doneRef.current?.();
      return;
    }
    setTravelling(true);
    const id = setTimeout(() => {
      setTravelling(false);
      doneRef.current?.();
    }, TRAVEL_MS);
    return () => clearTimeout(id);
  }, [from, reduced]);

  const [teaser, setTeaser] = useState<string | null>(null);
  useEffect(() => {
    if (!teaser) return;
    const id = setTimeout(() => setTeaser(null), 2600);
    return () => clearTimeout(id);
  }, [teaser]);

  const at = travelling && from ? from : marker;
  const currentBoard = boards.get(marker.boardSlug);
  // Two real paths rather than one with a dash offset: mixing pathLength with a
  // non-uniform viewBox and non-scaling strokes is not reliable across browsers,
  // and "the part already travelled" is just a prefix of the same points.
  const path = (nodes: typeof world.nodes) => nodes.map((n, i) => `${i === 0 ? "M" : "L"} ${(n.x * 100).toFixed(2)} ${(n.y * 100).toFixed(2)}`).join(" ");
  const travelled = world.nodes.slice(0, Math.max(world.nodes.findIndex((n) => n.boardSlug === marker.boardSlug), 0) + 1);

  return (
    <div className="wmap" style={{ ["--wmap-sky" as string]: world.map.palette.sky, ["--wmap-accent" as string]: world.map.palette.accent }}>
      <header className="wmap__bar">
        <div className="wmap__who">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.child.avatarUrl} alt="" className="fm-sticker wmap__face" width={48} height={48} />
          <div>
            <h1 className="wmap__title">{world.name}</h1>
            <p className="wmap__sub">{done === 0 ? world.tagline : tf(g.map.stamps, { done, total, piece: world.collectible.piece })}</p>
          </div>
        </div>
        <div className="wmap__actions">
          {onWorlds ? (
            <button type="button" className="fm-btn fm-btn--secondary fm-btn--sm" onClick={onWorlds}>
              🗺️ {g.hub.back}
            </button>
          ) : null}
          {done > 0 ? (
            <button type="button" className="fm-btn fm-btn--secondary fm-btn--sm" onClick={onPassport}>
              {world.collectible.icon} {done}/{total}
            </button>
          ) : null}
        </div>
      </header>

      <div className="wmap__frame">
        <div className="wmap__art" style={{ aspectRatio: `${world.map.width} / ${world.map.height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={world.map.art} alt="" className="wmap__img" width={world.map.width} height={world.map.height} draggable={false} />

          {/* The journey, drawn in journey order so it always matches the real route. */}
          <svg className="wmap__route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path d={path(world.nodes)} className="wmap__route-line" />
            {travelled.length > 1 ? <path d={path(travelled)} className="wmap__route-done" /> : null}
          </svg>

          {/* Nine buttons, in route order: this list is the map for a keyboard. */}
          <ol className="wmap__nodes" aria-label={g.map.stopsAria}>
            {world.nodes.map((node) => {
              const board = boards.get(node.boardSlug);
              const state: NodeState = states[node.boardSlug] ?? "future";
              const sp = sceneProgress(progress, node.boardSlug);
              const label = board?.name ?? node.boardSlug;
              const playable = state !== "future";
              return (
                <li key={node.boardSlug} className={`wmap__node wmap__node--${state}`} style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}>
                  <button
                    type="button"
                    className="wmap__dot"
                    onClick={() => (playable ? onOpen(node.boardSlug) : setTeaser(node.boardSlug))}
                    // Kept focusable and announced rather than `disabled`: a child
                    // should be able to reach a later destination and be told, in a
                    // friendly way, that it is still ahead of them.
                    aria-disabled={playable ? undefined : true}
                    aria-current={state === "current" ? "step" : undefined}
                    aria-label={`${node.routeIndex}. ${label} — ${stateLabel(g, state, sp.completed)}`}
                    data-board={node.boardSlug}
                  >
                    <span className="wmap__icon" aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {board ? <img src={board.art.thumbnail} alt="" loading="lazy" /> : null}
                    </span>
                    {state === "completed" ? (
                      <span className="wmap__stamp" aria-hidden>
                        {world.collectible.icon}
                      </span>
                    ) : null}
                  </button>
                  <span className={`wmap__label wmap__label--${node.labelAnchor}`} aria-hidden>
                    {label}
                  </span>
                  {teaser === node.boardSlug ? (
                    <span className="wmap__teaser" role="status">
                      {g.map.notYet}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {/* The child, standing on the map. */}
          <div
            className={`wmap__marker${travelling ? " wmap__marker--travel" : ""} wmap__marker--${at.travelStyle}`}
            style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, transitionDuration: `${TRAVEL_MS}ms` }}
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.child.avatarUrl} alt="" className="fm-sticker" width={56} height={56} />
          </div>
        </div>
      </div>

      {/* One obvious action.
          A landscape map on a portrait phone is letterboxed by its own shape, and
          a 48px dot is a small target for a four-year-old. This is the same tap,
          made unmissable — and it fills space that would otherwise be empty. */}
      {travelling ? (
        <button type="button" className="wmap__skip" onClick={() => setTravelling(false)}>
          {g.map.skip}
        </button>
      ) : currentBoard ? (
        <button type="button" className="wmap__go" onClick={() => onOpen(currentBoard.slug)}>
          <span className="wmap__go-thumb" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentBoard.art.thumbnail} alt="" />
          </span>
          <span className="wmap__go-text">
            <span className="wmap__go-kicker">{done === 0 ? g.map.here : g.map.soon}</span>
            <span className="wmap__go-name">{currentBoard.name}</span>
          </span>
          <span className="wmap__go-arrow" aria-hidden>
            ➜
          </span>
        </button>
      ) : null}
      {demo ? <p className="map__demo">{g.map.demoNote}</p> : null}
    </div>
  );
}

function stateLabel(g: ReturnType<typeof useGameText>["g"], state: NodeState, replayable: boolean): string {
  if (state === "completed") return replayable ? g.map.playAgain : g.map.done;
  if (state === "current") return g.map.here;
  if (state === "next") return g.map.soon;
  return g.map.later;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

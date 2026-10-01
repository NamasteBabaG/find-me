"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { gameWorlds, scenesOfWorld, type GameConfig, type PlayWorld } from "@/domain/game/config";
import { gameStars, sceneCanAdvance, sceneFoundIds, sceneIsComplete, sceneIsPlayable, sceneProgress, type GameProgress } from "@/domain/game/progress";
import { boardSlugs, isWorldComplete, nodeStates, type NodeState } from "@/domain/world";
import { useGameText } from "../i18n";
import { sounds } from "../audio/sounds";
import { IslandGrid } from "./IslandGrid";
import { StarCounter } from "./StarCounter";
import { StarTray } from "./StarTray";

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
  onReplay?: (slug: string) => void;
  roundRoute?: string[];
}

/** Roughly the brief's 1.2–1.8s, and skippable. */
const TRAVEL_MS = 1500;
/** Choosing a place: the child walks there first, briefly, then the place opens. */
const CHOOSE_MS = 700;

/**
 * The world map: one painted illustration, nine destinations, and the child's
 * own marker walking the route between them.
 *
 * The art is scenery. Every node, label and the marker is a DOM layer on top,
 * so they respond to progress, language and direction — and so the map is also
 * an ordered list of nine buttons for anyone using a keyboard or a screen
 * reader. A game composed before worlds existed falls back to the island grid.
 */
export function WorldMap({ config, world: shown, progress, onOpen, onPassport, onWorlds, demo, travelFrom, onTravelDone, onReplay, roundRoute }: Props) {
  const world = shown ?? gameWorlds(config)[0];
  if (!world) return <IslandGrid config={config} progress={progress} onOpen={onOpen} onPassport={onPassport} demo={demo} />;
  return <WorldMapView config={config} world={world} progress={progress} onOpen={onOpen} onPassport={onPassport} onWorlds={onWorlds} demo={demo} travelFrom={travelFrom} onTravelDone={onTravelDone} onReplay={onReplay} roundRoute={roundRoute} />;
}

function WorldMapView({ config, world, progress, onOpen, onPassport, onWorlds, demo, travelFrom, onTravelDone, onReplay, roundRoute }: Props & { world: PlayWorld }) {
  const { g, tf } = useGameText();
  // Only this world's boards. Counting the whole game against nine nodes is
  // how a two-world game reported 10/9 — and how world two's map lit up
  // because world one had been finished.
  const mine = useMemo(() => scenesOfWorld(config, world.slug).filter(s => !roundRoute || roundRoute.includes(s.slug)), [config, world.slug, roundRoute]);
  const nodes = useMemo(() => world.nodes.filter(n => !roundRoute || roundRoute.includes(n.boardSlug)), [world.nodes, roundRoute]);
  const completed = useMemo(() => mine.filter((s) => sceneIsComplete(progress, s)).map((s) => s.slug), [mine, progress]);
  const passed = useMemo(() => mine.filter((s) => sceneCanAdvance(progress, s)).map((s) => s.slug), [mine, progress]);
  const states = useMemo(() => nodeStates({ ...world, nodes }, { completedBoards: passed }), [world, nodes, passed]);
  const free = mine.some(scene => scene.playMode === "find-any");
  const stars = gameStars(progress, mine);
  const boards = useMemo(() => new Map(mine.map((s) => [s.slug, s])), [mine]);
  const done = completed.length;
  const total = nodes.length;
  const complete = total > 0 && isWorldComplete({ ...world, nodes }, { completedBoards: passed });
  const fullyComplete = total > 0 && completed.length === total;
  const replayBoard = boardSlugs(world).find((slug) => boards.has(slug));
  const completionTitleId = useId();

  // The marker's position is saved progress; the travel is only its presentation.
  const marker = nodes.find((n) => states[n.boardSlug] === "current") ?? nodes[nodes.length - 1] ?? world.nodes[0]!;
  // A completed journey has no next stop: neither animate nor offer "skip next".
  const from = travelFrom && !complete ? world.nodes.find((n) => n.boardSlug === travelFrom) : undefined;
  const [travelling, setTravelling] = useState(Boolean(from));
  const reduced = usePrefersReducedMotion();
  const doneRef = useRef(onTravelDone);
  doneRef.current = onTravelDone;

  useEffect(() => {
    if (complete) {
      setTravelling(false);
      if (travelFrom) doneRef.current?.();
    }
  }, [complete, travelFrom]);

  // A walk asked from a place this map does not show still has to finish, or a queued next place would never open.
  useEffect(() => {
    if (!complete && travelFrom && !from) doneRef.current?.();
  }, [complete, travelFrom, from]);

  useEffect(() => {
    if (complete || !from) return;
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
  }, [from, reduced, complete]);

  const [teaser, setTeaser] = useState<string | null>(null);
  useEffect(() => {
    if (!teaser) return;
    const id = setTimeout(() => setTeaser(null), 2600);
    return () => clearTimeout(id);
  }, [teaser]);
  // Arriving at the next place (walked or skipped), the child says so from the marker, briefly.
  const [arrived, setArrived] = useState(false);
  const wasTravelling = useRef(travelling);
  useEffect(() => {
    const landed = wasTravelling.current && !travelling;
    wasTravelling.current = travelling;
    if (!landed) return;
    setArrived(true);
    const id = setTimeout(() => setArrived(false), 2400);
    return () => clearTimeout(id);
  }, [travelling]);

  // Per Guy (2026-10-01): the map shows places by name and the child alone. Tapping a place walks the child there
  // first and then opens it, so the child is always standing where they are about to play.
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    if (!chosen) return;
    const id = setTimeout(() => onOpen(chosen), CHOOSE_MS);
    return () => clearTimeout(id);
  }, [chosen, onOpen]);
  const choose = (slug: string) => {
    if (chosen) return;
    if (reduced || slug === marker.boardSlug) onOpen(slug);
    else setChosen(slug);
  };
  const chosenNode = chosen ? world.nodes.find((n) => n.boardSlug === chosen) : undefined;
  const at = chosenNode ?? (travelling && from ? from : marker);
  const currentBoard = boards.get(marker.boardSlug);

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
          {/* The world's gold stars, always shown, even at zero: it is what there is to collect. Opens the bag. */}
          <button type="button" className="wmap__starsbtn" onClick={onPassport} aria-label={`${tf(g.stars.counter, { earned: stars.found, total: stars.total })} — ${g.map.bag}`}>
            <StarCounter earned={stars.found} total={stars.total} size="sm" />
          </button>
        </div>
      </header>

      {complete ? (
        <section className="wmap__complete" aria-labelledby={completionTitleId}>
          <div className="wmap__complete-count" aria-hidden>{free ? `${stars.found}/${stars.total}` : `${done}/${total}`}</div>
          <div className="wmap__complete-body">
            <div role="status">
              <h2 id={completionTitleId} className="wmap__complete-title">{free && !fullyComplete ? g.scene.journeyFinished : world.completion.title}</h2>
              {/* Older saved configs can carry retired/gendered completion copy. */}
              <p className="wmap__complete-text">{free && !fullyComplete ? g.scene.keepSearching : tf(g.map.completedText, { name: config.child.name })}</p>
            </div>
            <p className="wmap__complete-replay">{g.map.completedReplay}</p>
            <div className="wmap__complete-actions">
              <button type="button" className="fm-btn fm-btn--kid" onClick={onPassport}>{g.map.viewCollection}</button>
              {replayBoard ? <button type="button" className="fm-btn fm-btn--secondary fm-btn--kid" onClick={() => (onReplay ?? onOpen)(replayBoard)}>{g.map.replayWorld}</button> : null}
            </div>
          </div>
        </section>
      ) : null}

      <div className="wmap__frame">
        <div className="wmap__art" style={{ aspectRatio: `${world.map.width} / ${world.map.height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={world.map.art} alt="" className="wmap__img" width={world.map.width} height={world.map.height} draggable={false} />

          {/* Nine places, in route order: each is its name, and the name is the button. No board
              thumbnails and no drawn route on top of the painting: only the child marks a place.
              This list is also the map for a keyboard or a screen reader. */}
          <ol className="wmap__nodes" aria-label={g.map.stopsAria}>
            {nodes.map((node) => {
              const board = boards.get(node.boardSlug);
              const state: NodeState = states[node.boardSlug] ?? "future";
              const sp = sceneProgress(progress, node.boardSlug);
              const label = board?.name ?? node.boardSlug;
              const playable = roundRoute ? roundRoute.slice(0, roundRoute.indexOf(node.boardSlug)).every(slug => {
                const preceding = config.scenes.find(s => s.slug === slug);
                return !!preceding && sceneCanAdvance(progress, preceding);
              }) : board?.playMode === "find-any" ? sceneIsPlayable(progress, config, board) : state !== "future";
              const boardComplete = board ? sceneIsComplete(progress, board) : sp.completed;
              const count = board ? sceneFoundIds(progress, board).length : 0;
              const here = at.boardSlug === node.boardSlug;
              return (
                <li key={node.boardSlug} className={`wmap__node wmap__node--${state === "completed" && !boardComplete ? "visited" : state}${here ? " is-here" : ""}`} style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}>
                  <button
                    type="button"
                    className="wmap__place"
                    onClick={() => { sounds().play("tap"); if (playable) choose(node.boardSlug); else setTeaser(node.boardSlug); }}
                    // Kept focusable and announced rather than `disabled`: a child
                    // should be able to reach a later destination and be told, in a
                    // friendly way, that it is still ahead of them.
                    aria-disabled={playable ? undefined : true}
                    aria-current={state === "current" ? "step" : undefined}
                    aria-label={`${node.routeIndex}. ${label} — ${board?.playMode === "find-any" ? tf(g.scene.boardStars, { found: count, total: board.targets.length }) : stateLabel(g, state, sp.completed)}`}
                    data-board={node.boardSlug}
                  >
                    {boardComplete ? <span className="wmap__place-done" aria-hidden>✓</span> : null}
                    <span className="wmap__place-name" aria-hidden>{label}</span>
                    {/* The gold stars it holds, as one star and a count: what there is to come back for. */}
                    {board && count > 0 && !boardComplete ? (
                      <span className="wmap__place-stars" aria-hidden>
                        <StarCounter earned={count} total={board.targets.length} size="sm" />
                      </span>
                    ) : null}
                  </button>
                  {teaser === node.boardSlug ? (
                    <span className="wmap__teaser" role="status">
                      {g.map.notYet}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {/* The child, standing above the place they are at or have just chosen. */}
          <div
            className={`wmap__marker${travelling || chosen ? " wmap__marker--travel" : ""} wmap__marker--${at.travelStyle}`}
            style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, transitionDuration: `${chosen ? CHOOSE_MS : TRAVEL_MS}ms` }}
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.child.avatarUrl} alt="" className="fm-sticker" width={56} height={56} />
            {arrived ? <span className="bubble wmap__hello">{g.map.arrived}</span> : null}
          </div>
        </div>
      </div>

      {/* One obvious action.
          A landscape map on a portrait phone is letterboxed by its own shape, and
          a 48px dot is a small target for a four-year-old. This is the same tap,
          made unmissable — and it fills space that would otherwise be empty. */}
      {complete ? null : travelling ? (
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
            {/* What this place is worth, before a single tap: its empty slots, or the stars it already holds. */}
            <span className="wmap__go-stars">
              <StarTray lit={sceneFoundIds(progress, currentBoard).length} total={currentBoard.targets.length} size="xs" />
              {/* Once some are found, say how many: "3 are waiting here" beside two lit stars read as a mistake. */}
              <span>{sceneFoundIds(progress, currentBoard).length > 0
                ? tf(g.stars.tray, { earned: sceneFoundIds(progress, currentBoard).length, total: currentBoard.targets.length })
                : tf(g.stars.here, { total: currentBoard.targets.length })}</span>
            </span>
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

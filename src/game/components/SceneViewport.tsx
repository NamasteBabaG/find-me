"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneConfig, TargetConfig } from "@/domain/game/config";
import type { MissionState } from "@/domain/game/mission";
import { currentTargetId, isFound } from "@/domain/game/mission";
import type { HintLevel } from "@/domain/game/hints";
import { assetPlan, preloadVerdict, type LoadResult } from "../engine/asset-plan";
import { expandRect, hitPadding, hitTest, spriteRect, stageToScreen, type HitCandidate, type NormRect } from "../engine/viewport-math";
import { spriteAspect, targetGeometry } from "../engine/target-geometry";
import { useViewport, type ViewportApi } from "../engine/useViewport";
import { Sprite } from "./Sprite";
import { FoundParticles } from "./FoundParticles";

export type Hit = { kind: "target"; id: string } | { kind: "found-target"; id: string } | { kind: "bonus" } | { kind: "ambient"; id: string } | { kind: "miss"; x: number; y: number };

interface Props {
  scene: SceneConfig;
  mission: MissionState;
  hintLevel: HintLevel;
  bonusFound: boolean;
  onHit: (hit: Hit) => void;
  onReady?: (api: ViewportApi) => void;
  /** Every image this board can show has decoded — base, foreground, all three children, the bonus. */
  onAssetsReady?: () => void;
  /** Something the board cannot open without did not load. The player shows a calm retry. */
  onAssetsFailed?: () => void;
  /** Bumped by the player to load again after a failure. */
  retryToken?: number;
  ariaLabel?: string;
  /** Screen-space overlays get the transform via render prop. */
  children?: (api: ViewportApi) => React.ReactNode;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/**
 * The stage: base art → sprites behind foreground → foreground → sprites → bonus.
 * All hit-testing is math on normalized coordinates (no DOM hit targets), so a
 * tap resolves the same way on every device and at every zoom.
 */
export function SceneViewport({ scene, mission, hintLevel, bonusFound, onHit, onReady, onAssetsReady, onAssetsFailed, retryToken = 0, ariaLabel, children }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stage = useMemo(() => ({ width: scene.art.width, height: scene.art.height }), [scene.art.width, scene.art.height]);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [ambientAnim, setAmbientAnim] = useState<Record<string, number>>({});
  const missionRef = useRef(mission);
  missionRef.current = mission;
  const bonusFoundRef = useRef(bonusFound);
  bonusFoundRef.current = bonusFound;

  const placedTargets = useMemo(
    () => scene.targets.map((t) => ({ target: t, ...targetGeometry(scene, t, mission.plan.variants[t.id] ?? "A") })),
    [scene, mission.plan.variants],
  );

  const bonus = useMemo(() => {
    if (!scene.bonus) return null;
    const slot = mission.plan.bonusVariant === "A" ? scene.bonus.slots[0] : scene.bonus.slots[1];
    return { slot, anchor: { x: slot.x, y: slot.y, scale: scene.bonus.scale } };
  }, [scene.bonus, mission.plan.bonusVariant]);

  const apiRef = useRef<ViewportApi | null>(null);

  const onTap = useCallback(
    (nx: number, ny: number) => {
      const api = apiRef.current;
      const scale = api?.transform.scale ?? 1;
      const m = missionRef.current;
      const candidates: HitCandidate<Hit>[] = [];
      // Only the child being looked for is on the board, so she is the only
      // target that can be tapped (see the note on `onBoard` below).
      const current = currentTargetId(m);
      const available = placedTargets.filter(p => (m.playMode === "find-any" || p.target.id === current));
      // A real footprint wins over a neighbour's touch padding. A found figure
      // may explain itself in find-any, but never becomes another reward or a
      // bonus underneath it. Legacy serial finds keep their existing no-op.
      const exact = hitTest(available.map(p => ({ id: p.target.id, rect: p.hitRect, zIndex: p.slot.zIndex })), nx, ny);
      if (exact) {
        if (!isFound(m, exact)) onHit({ kind: "target", id: exact });
        else if (m.playMode === "find-any") onHit({ kind: "found-target", id: exact });
        return;
      }
      const padded: HitCandidate<Hit>[] = [];
      for (const p of available) {
        if (isFound(m, p.target.id)) continue;
        // p.hitRect is the child's own footprint — for a slot patch that is not
        // the slot anchor, so the head is inside it (see target-geometry).
        // 64px, not 48: this is tapped by a four-year-old, and the design
        // system's floor for a child's target is 64. A peeking head on a phone
        // can be twenty pixels across; the padding is what makes it findable.
        const pad = hitPadding(p.hitRect, stage, scale, 64);
        padded.push({ id: { kind: "target", id: p.target.id }, rect: expandRect(p.hitRect, pad.padX, pad.padY), zIndex: 50 + p.slot.zIndex });
      }
      // Overlapping invisible padding is not permission to choose a random hide.
      const near = padded.filter(candidate => hitTest([candidate], nx, ny));
      if (near.length === 1) candidates.push(near[0]!);
      if (bonus && !bonusFoundRef.current) {
        const rect = spriteRect(bonus.anchor, stage, 1);
        const pad = hitPadding(rect, stage, scale);
        candidates.push({ id: { kind: "bonus" }, rect: expandRect(rect, pad.padX, pad.padY), zIndex: 40 });
      }
      for (const a of scene.ambient) {
        const rect: NormRect = { x0: a.x, y0: a.y, x1: a.x + a.w, y1: a.y + a.h };
        candidates.push({ id: { kind: "ambient", id: a.id }, rect, zIndex: 30 });
      }
      const hit = hitTest(candidates, nx, ny);
      if (hit && hit.kind === "ambient") setAmbientAnim((s) => ({ ...s, [hit.id]: Date.now() }));
      if (hit) onHit(hit);
      else {
        onHit({ kind: "miss", x: nx, y: ny });
      }
      if (!hit || hit.kind === "miss" || hit.kind === "ambient") {
        const id = Date.now();
        setRipples((r) => [...r.slice(-4), { id, x: nx, y: ny }]);
        setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 700);
      }
    },
    [placedTargets, bonus, scene.ambient, stage, onHit],
  );

  // Edge hides can be panned out from under the persistent upper-right HUD.
  const api = useViewport(containerRef, stage, onTap, { panPadding: 220 });
  apiRef.current = api;

  // The board webp is static and fast; a child's patch is a signed database
  // asset and is not. Drawn as they arrive, the world appeared first and the
  // child popped into it a second later — which is the answer, shown before the
  // question. And because only the current target is drawn, the same pop-in
  // would spoil every later mission too. So every picture is preloaded up
  // front, and the curtain in ScenePlayer stays shut until this succeeds.
  // An essential failure or timeout shows a retry screen, never a blind open.
  const plan = useMemo(() => assetPlan(scene, placedTargets.map((p) => (p.sprite.kind === "image" ? p.sprite.url : p.sprite.faceUrl))), [scene, placedTargets]);
  const assetsReadyRef = useRef(onAssetsReady);
  assetsReadyRef.current = onAssetsReady;
  const assetsFailedRef = useRef(onAssetsFailed);
  assetsFailedRef.current = onAssetsFailed;
  useEffect(() => {
    let settled = false;
    const settle = (verdict: "ready" | "failed") => {
      if (settled) return;
      settled = true;
      clearTimeout(slow);
      if (verdict === "ready") assetsReadyRef.current?.();
      else assetsFailedRef.current?.();
    };
    // The board and the child in it are the game: without them there is
    // nothing to find, so a missing one is a calm retry screen, never an open
    // board with an impossible mission. The foreground and the bonus are
    // decoration and may fail quietly. Twenty seconds is a slow phone on a
    // slow network; what happens then is the retry screen, not a blind open.
    const slow = setTimeout(() => settle("failed"), 20_000);
    Promise.all(
      [...plan.essential, ...plan.decorative].map(
        (url) =>
          new Promise<LoadResult>((resolve) => {
            // All essential pixels must decode before the curtain opens.
            // A delayed/failed decode takes the ordinary bounded retry path.
            const img = new Image();
            img.onload = () => {
              if (typeof img.decode !== "function") { resolve({ url, ok: true }); return; }
              void img.decode().then(() => resolve({ url, ok: true }), () => resolve({ url, ok: false }));
            };
            img.onerror = () => resolve({ url, ok: false });
            img.src = url;
          }),
      ),
    ).then((results) => settle(preloadVerdict(plan, results)));
    return () => {
      settled = true;
      clearTimeout(slow);
    };
    // Once per board, and again on an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.slug, retryToken]);

  // Handed over at first layout and again on every resize: the methods read
  // live state now, but the snapshot fields (transform, fit, viewport) on the
  // object the player keeps would otherwise describe a screen that is gone.
  useEffect(() => {
    if (api.viewport.width > 0) onReady?.(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.viewport.width, api.viewport.height]);

  const current = currentTargetId(mission);
  const currentPlaced = placedTargets.find((p) => p.target.id === current) ?? null;
  /**
   * One child on the board at a time.
   *
   * The game asks "where am I?" — she cannot be in three places at once, and
   * three of her at once also makes a mission like "the one with the hat"
   * meaningless. So only the child of the current mission is drawn; she stays
   * through the found celebration (the mission advances on FOUND_DONE) and is
   * replaced by the next one.
   */
  const onBoard = placedTargets.filter((p) => mission.playMode === "find-any" || p.target.id === current);
  const { transform } = api;
  const stageStyle: React.CSSProperties = {
    width: stage.width,
    height: stage.height,
    transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
  };

  const renderTarget = (p: (typeof placedTargets)[number]) => {
    const found = isFound(mission, p.target.id);
    const h = p.anchor.scale * stage.height;
    const w = h * spriteAspect(p.sprite);
    const rect = p.sprite.kind === "image" ? p.sprite.rect : undefined;
    // A slot patch is a piece of the world painted with the child: draw it exactly where it was cut from.
    const box = rect
      ? { left: rect.x * stage.width, top: rect.y * stage.height, width: rect.w * stage.width, height: rect.h * stage.height, zIndex: p.slot.zIndex, transform: p.slot.flip ? "scaleX(-1)" : undefined }
      : { left: p.anchor.x * stage.width, top: p.anchor.y * stage.height, width: w, height: h, zIndex: p.slot.zIndex, transform: `translate(-50%, -50%) rotate(${p.slot.rotation}deg)${p.slot.flip ? " scaleX(-1)" : ""}` };
    // A find changes no pixels, filters, transforms or stacking of the child.
    // Its feedback is rendered separately, above ALL board layers, below.
    return (
      <div key={p.target.id} className={`stage__target${p.isPatch ? " stage__target--patch" : ""}`} style={box} data-target={p.target.id} data-found={found}>
        <Sprite sprite={p.sprite} title={p.target.item} className="stage__sprite" />
      </div>
    );
  };

  return (
    <div ref={containerRef} className={`viewport${api.isDragging ? " viewport--dragging" : ""}`} {...api.bind} role="application" aria-label={ariaLabel ?? scene.name}>
      <div className="stage" style={stageStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={scene.art.base} alt="" width={stage.width} height={stage.height} className="stage__layer" draggable={false} />
        <div className="stage__layer">{onBoard.filter((p) => p.slot.layer === "behindForeground").map(renderTarget)}</div>
        {scene.art.foreground ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.art.foreground} alt="" width={stage.width} height={stage.height} className="stage__layer stage__layer--fg" draggable={false} />
        ) : null}
        <div className="stage__layer">{onBoard.filter((p) => p.slot.layer !== "behindForeground").map(renderTarget)}</div>

        {bonus && scene.bonus ? (
          <div
            className={`stage__bonus${bonusFound ? " stage__bonus--found" : ""}`}
            style={{ left: bonus.anchor.x * stage.width, top: bonus.anchor.y * stage.height, width: bonus.anchor.scale * stage.height, height: bonus.anchor.scale * stage.height }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scene.bonus.sprite} alt={scene.bonus.name} draggable={false} />
          </div>
        ) : null}

        {scene.ambient.map((a) => {
          const stamp = ambientAnim[a.id];
          return (
            <div key={a.id} className="stage__ambient" style={{ left: a.x * stage.width, top: a.y * stage.height, width: a.w * stage.width, height: a.h * stage.height }} aria-hidden>
              {stamp ? (
                <span key={stamp} className={`stage__ambient-glyph amb-${a.animation}`} style={{ fontSize: Math.min(a.w * stage.width, a.h * stage.height) * 0.9 }}>
                  {a.glyph ?? "✨"}
                </span>
              ) : null}
            </div>
          );
        })}

        {/* level-2 hint: glow over the hint zone (stage space so it pans with the art) */}
        {hintLevel >= 2 && currentPlaced && mission.phase === "searching" ? (
          <div
            className="stage__glow"
            style={{
              left: currentPlaced.hintZone.x * stage.width,
              top: currentPlaced.hintZone.y * stage.height,
              width: currentPlaced.hintZone.r * 2 * stage.width,
              height: currentPlaced.hintZone.r * 2 * stage.width,
            }}
            aria-hidden
          />
        ) : null}
      </div>

      {/* A saved find remains legible after its transient celebration. This
          screen-space badge never changes the painted patch or its hit area. */}
      {mission.playMode === "find-any" ? <div className="viewport__found-markers" aria-hidden>
        {onBoard.filter(p => isFound(mission, p.target.id)).map(p => {
          const head = stageToScreen(transform, p.head.x * stage.width, p.head.y * stage.height);
          const right = stageToScreen(transform, Math.max(p.head.x, p.hitRect.x1) * stage.width, p.head.y * stage.height);
          // 24px badge + the design system's small spacing allowance. Put it
          // outside the child's footprint, changing sides near the screen edge.
          const leftSide = right.x + 32 > api.viewport.width;
          const point = leftSide
            ? stageToScreen(transform, Math.min(p.head.x, p.hitRect.x0) * stage.width, p.head.y * stage.height)
            : right;
          return <span key={p.target.id} data-found-marker={p.target.id}
            className={`found-marker${leftSide ? " found-marker--left" : ""}${head.y < 32 ? " found-marker--below" : ""}`}
            style={{ left: point.x, top: head.y }}>★</span>;
        })}
      </div> : null}

      {/* screen-space overlays */}
      <div className="overlay" aria-hidden>
        {ripples.map((r) => {
          const p = stageToScreen(transform, r.x * stage.width, r.y * stage.height);
          return <span key={r.id} className="ripple" style={{ left: p.x, top: p.y }} />;
        })}
        {hintLevel >= 3 && currentPlaced && mission.phase === "searching"
          ? (() => {
              const p = stageToScreen(transform, currentPlaced.head.x * stage.width, currentPlaced.head.y * stage.height);
              return (
                <span key={`mag-${current}`} className="magnifier" style={{ left: p.x, top: p.y }}>
                  🔍
                </span>
              );
            })()
          : null}
        {children?.(api)}
      </div>
      <div className="viewport__particles" aria-hidden>
        {onBoard.filter(p => isFound(mission, p.target.id) && mission.lastFeedback?.kind === "hit" && mission.lastFeedback.targetId === p.target.id).map(p => {
          const point = stageToScreen(transform, p.center.x * stage.width, p.center.y * stage.height);
          return <FoundParticles key={p.target.id} x={point.x} y={point.y}
            width={Math.max(48, (p.hitRect.x1 - p.hitRect.x0) * stage.width * transform.scale * 1.6)}
            height={Math.max(48, (p.hitRect.y1 - p.hitRect.y0) * stage.height * transform.scale * 1.25)} />;
        })}
      </div>
    </div>
  );
}

/**
 * Where a target's head sits in stage pixels. Overlays keep this and project it
 * with the *current* transform on every render, so they follow zooms and pans.
 */
export function targetStagePoint(scene: SceneConfig, target: TargetConfig, variant: "A" | "B"): { x: number; y: number } {
  const { head } = targetGeometry(scene, target, variant);
  return { x: head.x * scene.art.width, y: head.y * scene.art.height };
}

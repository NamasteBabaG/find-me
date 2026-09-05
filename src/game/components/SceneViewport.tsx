"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneConfig, TargetConfig } from "@/domain/game/config";
import type { MissionState } from "@/domain/game/mission";
import { currentTargetId, isFound } from "@/domain/game/mission";
import type { HintLevel } from "@/domain/game/hints";
import { expandRect, hitPadding, hitTest, spriteRect, stageToScreen, type HitCandidate, type NormRect } from "../engine/viewport-math";
import { spriteAspect, targetGeometry } from "../engine/target-geometry";
import { useViewport, type ViewportApi } from "../engine/useViewport";
import { Sprite } from "./Sprite";

export type Hit = { kind: "target"; id: string } | { kind: "bonus" } | { kind: "ambient"; id: string } | { kind: "miss"; x: number; y: number };

interface Props {
  scene: SceneConfig;
  mission: MissionState;
  hintLevel: HintLevel;
  bonusFound: boolean;
  onHit: (hit: Hit) => void;
  onReady?: (api: ViewportApi) => void;
  /** Every image this board can show has decoded — base, foreground, all three children, the bonus. */
  onAssetsReady?: () => void;
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
/** Where the sparks fly to, as fractions of the halo box, and how late each starts. */
const SPARKS = [
  { x: -0.55, y: -0.6, d: 0 },
  { x: 0.6, y: -0.5, d: 60 },
  { x: -0.7, y: 0.1, d: 120 },
  { x: 0.7, y: 0.15, d: 40 },
  { x: -0.35, y: 0.65, d: 160 },
  { x: 0.4, y: 0.7, d: 100 },
  { x: 0, y: -0.8, d: 200 },
  { x: 0.05, y: 0.85, d: 140 },
];

export function SceneViewport({ scene, mission, hintLevel, bonusFound, onHit, onReady, onAssetsReady, ariaLabel, children }: Props) {
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
      for (const p of placedTargets) {
        if (p.target.id !== current || isFound(m, p.target.id)) continue;
        // p.hitRect is the child's own footprint — for a slot patch that is not
        // the slot anchor, so the head is inside it (see target-geometry).
        // 64px, not 48: this is tapped by a four-year-old, and the design
        // system's floor for a child's target is 64. A peeking head on a phone
        // can be twenty pixels across; the padding is what makes it findable.
        const pad = hitPadding(p.hitRect, stage, scale, 64);
        candidates.push({ id: { kind: "target", id: p.target.id }, rect: expandRect(p.hitRect, pad.padX, pad.padY), zIndex: 50 + p.slot.zIndex });
      }
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

  const api = useViewport(containerRef, stage, onTap);
  apiRef.current = api;

  // The board webp is static and fast; a child's patch is a signed database
  // asset and is not. Drawn as they arrive, the world appeared first and the
  // child popped into it a second later — which is the answer, shown before the
  // question. And because only the current target is drawn, the same pop-in
  // would spoil every later mission too. So every picture the board can ever
  // show is decoded up front, and the curtain in ScenePlayer stays shut until
  // this fires. One bad asset must not shut the game forever: ten seconds, then
  // we open regardless and let the <img> show its own failure.
  const assetUrls = useMemo(() => {
    const urls = new Set<string>([scene.art.base]);
    if (scene.art.foreground) urls.add(scene.art.foreground);
    for (const p of placedTargets) urls.add(p.sprite.kind === "image" ? p.sprite.url : p.sprite.faceUrl);
    if (scene.bonus?.sprite) urls.add(scene.bonus.sprite);
    return [...urls];
  }, [scene, placedTargets]);
  const assetsReadyRef = useRef(onAssetsReady);
  assetsReadyRef.current = onAssetsReady;
  useEffect(() => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      assetsReadyRef.current?.();
    };
    const fallback = setTimeout(() => {
      console.warn(`[scene] ${scene.slug}: not every asset decoded in 10s, opening anyway`);
      settle();
    }, 10_000);
    Promise.all(
      assetUrls.map(
        (url) =>
          new Promise<void>((resolve) => {
            // onload, not decode(): a background tab defers decoding until it
            // is looked at, and a parent who opens the link behind another
            // tab would sit on clouds until then. onload means the bytes are
            // here; the browser decodes on first paint, which is when it matters.
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
          }),
      ),
    ).then(settle);
    return () => {
      settled = true;
      clearTimeout(fallback);
    };
    // Once per board: the URL list only changes when the scene does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.slug]);

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
  const onBoard = placedTargets.filter((p) => p.target.id === current);
  const { transform } = api;
  const stageStyle: React.CSSProperties = {
    width: stage.width,
    height: stage.height,
    transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
  };

  const renderTarget = (p: (typeof placedTargets)[number]) => {
    const found = isFound(mission, p.target.id);
    const justFound = mission.lastFeedback?.kind === "hit" && mission.lastFeedback.targetId === p.target.id;
    const h = p.anchor.scale * stage.height;
    const w = h * spriteAspect(p.sprite);
    const rect = p.sprite.kind === "image" ? p.sprite.rect : undefined;
    // A slot patch is a piece of the world painted with the child: draw it exactly where it was cut from.
    const box = rect
      ? { left: rect.x * stage.width, top: rect.y * stage.height, width: rect.w * stage.width, height: rect.h * stage.height, zIndex: p.slot.zIndex, transform: p.slot.flip ? "scaleX(-1)" : undefined }
      : { left: p.anchor.x * stage.width, top: p.anchor.y * stage.height, width: w, height: h, zIndex: p.slot.zIndex, transform: `translate(-50%, -50%) rotate(${p.slot.rotation}deg)${p.slot.flip ? " scaleX(-1)" : ""}` };
    // A painted-in child is a piece of the picture. Bouncing or jumping her on
    // a find moved the patch, and for that half-second her cut edge showed —
    // she read as a sticker on top of the world rather than someone in it. So
    // the patch never moves: the celebration is a halo and sparks drawn around
    // her footprint, outside the sprite, and the persistent glow is a filter
    // that follows her silhouette. Composed stickers still get their bounce;
    // they were never pretending to be part of the painting.
    const celebrate = justFound && !p.isPatch ? ` anim-${p.target.animation}` : "";
    const halo =
      justFound && p.isPatch ? (
        <div
          className="stage__halo"
          style={{
            left: p.center.x * stage.width,
            top: p.center.y * stage.height,
            width: Math.max(48, (p.hitRect.x1 - p.hitRect.x0) * stage.width * 1.6),
            height: Math.max(48, (p.hitRect.y1 - p.hitRect.y0) * stage.height * 1.25),
          }}
          aria-hidden
        >
          {SPARKS.map((sp, i) => (
            <span key={i} className="stage__spark" style={{ ["--sx" as string]: sp.x, ["--sy" as string]: sp.y, ["--sd" as string]: `${sp.d}ms` }} />
          ))}
        </div>
      ) : null;
    return (
      <div key={p.target.id}>
        <div className={`stage__target${found ? " stage__target--found" : ""}`} style={box} data-target={p.target.id}>
          <div className={`tgt-anim${celebrate}`}>
            <Sprite sprite={p.sprite} title={p.target.item} className="stage__sprite" />
          </div>
        </div>
        {halo}
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
        {hintLevel >= 2 && currentPlaced ? (
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

      {/* screen-space overlays */}
      <div className="overlay" aria-hidden>
        {ripples.map((r) => {
          const p = stageToScreen(transform, r.x * stage.width, r.y * stage.height);
          return <span key={r.id} className="ripple" style={{ left: p.x, top: p.y }} />;
        })}
        {hintLevel >= 3 && currentPlaced
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

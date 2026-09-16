"use client";

import type { CSSProperties, ReactNode } from "react";
import type { AdventureBook } from "@/domain/adventure/book-schema";
import type { AdventureRect } from "@/domain/adventure/content";
import { gameAssetId } from "@/domain/adventure/image-binding";
import { adventureAlbum, type AdventureProgress } from "@/domain/adventure/progress";
import type { GameConfig, SceneConfig } from "@/domain/game/config";
import type { AlbumStatus } from "../engine/album-storage";
import { useGameText } from "../i18n";
import { StarTray } from "./StarTray";
import "./collection.css";

type BookBoard = AdventureBook["boards"][number];
type AlbumView = ReturnType<typeof adventureAlbum>;
type BoardView = AlbumView["boards"][number];
type Art = SceneConfig["art"];

/**
 * A window onto the board's existing pixels. The card and the postcard are
 * crops of the picture the child already searched, drawn with CSS: no new
 * image is generated, uploaded or paid for (rule 6 of the album).
 */
export function AlbumCrop({ art, crop, className, label, children }: { art: Art; crop: AdventureRect; className?: string; label?: string; children?: ReactNode }) {
  const style: CSSProperties = {
    aspectRatio: `${crop.w * art.width} / ${crop.h * art.height}`,
    backgroundImage: `url("${art.base}")`,
    backgroundSize: `${100 / crop.w}% auto`,
    backgroundPosition: `${crop.w < 1 ? (crop.x / (1 - crop.w)) * 100 : 0}% ${crop.h < 1 ? (crop.y / (1 - crop.h)) * 100 : 0}%`,
  };
  return (
    <div className={`album__crop${className ? ` ${className}` : ""}`} style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </div>
  );
}

/**
 * The postcard: the place, with the child painted in it, exactly the pixels of
 * the find that earned it (the variant of the first find, frozen by the book).
 */
export function Postcard({ scene, postcard, className }: { scene: SceneConfig; postcard: NonNullable<BoardView["postcard"]>; className?: string }) {
  const { g, tf } = useGameText();
  const target = scene.targets.find((t) => t.id === postcard.targetId);
  const sprite = target ? (target.spriteByVariant?.[postcard.variant] ?? target.sprite) : null;
  const patch = sprite && sprite.kind === "image" && sprite.rect && gameAssetId(sprite.url) === postcard.image.assetId ? { url: sprite.url, rect: sprite.rect } : null;
  const crop = postcard.crop;
  return (
    <figure className={`postcard${className ? ` ${className}` : ""}`}>
      <AlbumCrop art={scene.art} crop={crop} className="postcard__picture" label={tf(g.album.postcardAria, { title: postcard.title })}>
        {patch ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={patch.url}
            alt=""
            className="postcard__patch"
            draggable={false}
            style={{ left: `${((patch.rect.x - crop.x) / crop.w) * 100}%`, top: `${((patch.rect.y - crop.y) / crop.h) * 100}%`, width: `${(patch.rect.w / crop.w) * 100}%`, height: `${(patch.rect.h / crop.h) * 100}%` }}
          />
        ) : null}
      </AlbumCrop>
      <figcaption className="postcard__title">{postcard.title}</figcaption>
    </figure>
  );
}

function syncCopy(g: ReturnType<typeof useGameText>["g"], mode: "none" | "guest" | "owner", state: AlbumStatus): string | null {
  if (state === "unreadable") return g.album.unreadable;
  if (state === "unsaved") return g.album.unsaved;
  if (mode === "guest") return g.album.guest;
  if (mode !== "owner") return null;
  if (state === "saved") return g.album.savedAccount;
  if (state === "offline") return g.album.offline;
  if (state === "refused") return g.album.guest;
  return g.album.saving;
}

/**
 * The album inside the adventure bag: one sticker page per place. The
 * postcard (or how many hiding spots it still needs) sits beside the six
 * stickers of the place: found ones in full colour with a gold rim, the
 * missing ones ghosted with the hint that leads back to them. Three finds
 * open the next place; the postcard needs every hiding spot - said here and
 * at the moment of choice, never as a fixed line in the search HUD (Guy).
 */
export function AlbumSection({ config, album, mode, state, onOpen }: { config: GameConfig; album: AdventureProgress | null; mode: "none" | "guest" | "owner"; state: AlbumStatus; onOpen?: (slug: string) => void }) {
  const { g, tf } = useGameText();
  const c = g.collection;
  const book = config.adventure;
  if (!book) return null;
  let view: AlbumView | null = null;
  try {
    view = album ? adventureAlbum(album) : null;
  } catch {
    view = null;
  }
  const note = syncCopy(g, mode, view ? state : "unreadable");
  return (
    <section className="album" aria-labelledby="album-title">
      <header className="album__head">
        <div className="album__heading">
          <h2 id="album-title" className="album__title">{g.album.title}</h2>
          {view ? (
            <p className="album__tally">
              <span><span aria-hidden>✦</span> {tf(c.tally, { found: view.discoveries.collected, total: view.discoveries.total })} {c.title}</span>
              <span><span aria-hidden>✉️</span> {tf(c.tally, { found: view.postcards.collected, total: view.postcards.total })} {g.album.postcards}</span>
            </p>
          ) : null}
        </div>
        {note ? <p className="album__sync" data-album-state={state}>{note}</p> : null}
      </header>
      <p className="album__note">{g.album.continueNote}</p>
      {book.boards.map((board: BookBoard) => {
        const scene = config.scenes.find((s) => s.slug === board.boardSlug);
        const boardView = view?.boards.find((b) => b.boardSlug === board.boardSlug) ?? null;
        if (!scene) return null;
        const found = boardView?.stars.found ?? 0;
        const remaining = board.targetIds.length - found;
        const guided = board.collectionUi === "guided-v1";
        const got = (id: string) => boardView?.discoveries.find((x) => x.id === id)?.collected ?? false;
        const collectedCount = board.discoveries.filter((d) => got(d.id)).length;
        const allGot = board.discoveries.length > 0 && collectedCount === board.discoveries.length;
        return (
          <article key={board.boardSlug} className={`album__page${allGot ? " album__page--complete" : ""}`} data-board={board.boardSlug}>
            <header className="album__page-head">
              <h3 className="album__board-name">{scene.name}</h3>
              <StarTray lit={found} total={board.targetIds.length} size="sm" label={tf(g.stars.tray, { earned: found, total: board.targetIds.length })} />
              <span className={`album__page-tally${allGot ? " album__page-tally--done" : ""}`}>
                {allGot ? <><span aria-hidden>✨</span> {c.complete}</> : `${tf(c.tally, { found: collectedCount, total: board.discoveries.length })} ${c.title}`}
              </span>
            </header>
            <div className="album__row">
              <div className="album__postcards">
                <h4 className="album__kind">{g.album.postcards}</h4>
                {boardView?.postcard ? (
                  <Postcard scene={scene} postcard={boardView.postcard} className="album__postcard" />
                ) : (
                  <div className="album__postcard-wait" data-postcard-remaining={remaining}>
                    <span className="album__postcard-stamp" aria-hidden>✉️</span>
                    <span>{tf(remaining === 1 ? g.album.postcardRemainingOne : g.album.postcardRemaining, { remaining })}</span>
                  </div>
                )}
              </div>
              <div className="album__discoveries">
                <h4 className="album__kind">{c.title}</h4>
                <ul className="album__stickers">
                  {board.discoveries.map((d) => {
                    const collected = got(d.id);
                    // A guided board shows what is still hiding; an older book keeps its surprises.
                    const reveal = collected || guided;
                    return (
                      <li key={d.id} className={`album__sticker${collected ? " album__sticker--got" : ""}`} data-discovery={d.id} data-collected={collected}>
                        <div className={`sticker${collected ? " sticker--got" : ""}`} role="img" aria-label={collected ? tf(c.collectedAria, { name: d.name }) : reveal ? tf(c.pending, { name: d.name }) : g.album.notYet}>
                          <span className="sticker__face">
                            {reveal ? <AlbumCrop art={scene.art} crop={d.cardCrop} className="sticker__picture" /> : <span className="sticker__blank" aria-hidden>?</span>}
                            {/* The same green tick as on the board: one language for "found", in the bag too. */}
                            {collected ? <span className="sticker__check" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4.5 4.5L19 7" /></svg></span> : null}
                          </span>
                          {d.rarity ? <span className={`sticker__rarity sticker__rarity--${d.rarity}`}>{c.rarity[d.rarity]}</span> : null}
                          <span className="sticker__name">{reveal ? d.name : g.album.notYet}</span>
                        </div>
                        <p className="album__sticker-text">{collected ? d.description : tf(g.album.hintFor, { hint: d.hint })}</p>
                      </li>
                    );
                  })}
                </ul>
                {!allGot && onOpen ? (
                  <button type="button" className="fm-btn fm-btn--secondary fm-btn--sm album__seek" onClick={() => onOpen(board.boardSlug)}>{c.seekInBoard}</button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

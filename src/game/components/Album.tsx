"use client";

import type { CSSProperties, ReactNode } from "react";
import type { AdventureBook } from "@/domain/adventure/book-schema";
import type { AdventureRect } from "@/domain/adventure/content";
import { gameAssetId } from "@/domain/adventure/image-binding";
import { adventureAlbum, type AdventureProgress } from "@/domain/adventure/progress";
import type { GameConfig, SceneConfig } from "@/domain/game/config";
import type { AlbumSyncState } from "../engine/album-sync";
import { useGameText } from "../i18n";
import { StarTray } from "./StarTray";

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

function syncCopy(g: ReturnType<typeof useGameText>["g"], mode: "none" | "guest" | "owner", state: AlbumSyncState | "unreadable"): string | null {
  if (state === "unreadable") return g.album.unreadable;
  if (mode === "guest") return g.album.guest;
  if (mode !== "owner") return null;
  if (state === "saved") return g.album.savedAccount;
  if (state === "offline") return g.album.offline;
  if (state === "refused") return g.album.guest;
  return g.album.saving;
}

/**
 * The album inside the adventure bag: per place, the postcard (or how many
 * hiding spots it still needs) and the discovery cards. Three finds open the
 * next place; the postcard needs every hiding spot - said here and at the
 * moment of choice, never as a fixed line in the search HUD (Guy).
 */
export function AlbumSection({ config, album, mode, state }: { config: GameConfig; album: AdventureProgress | null; mode: "none" | "guest" | "owner"; state: AlbumSyncState | "unreadable" }) {
  const { g, tf } = useGameText();
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
      <div className="album__head">
        <h2 id="album-title" className="album__title">{g.album.title}</h2>
        {note ? <p className="album__sync" data-album-state={state}>{note}</p> : null}
      </div>
      <p className="album__note">{g.album.continueNote}</p>
      {book.boards.map((board: BookBoard) => {
        const scene = config.scenes.find((s) => s.slug === board.boardSlug);
        const boardView = view?.boards.find((b) => b.boardSlug === board.boardSlug) ?? null;
        if (!scene) return null;
        const found = boardView?.stars.found ?? 0;
        const remaining = board.targetIds.length - found;
        return (
          <article key={board.boardSlug} className="album__board" data-board={board.boardSlug}>
            <header className="album__board-head">
              <h3 className="album__board-name">{scene.name}</h3>
              <StarTray lit={found} total={board.targetIds.length} size="sm" label={tf(g.stars.tray, { earned: found, total: board.targetIds.length })} />
            </header>
            <div className="album__row">
              <div className="album__postcards">
                <h4 className="album__kind">{g.album.postcards}</h4>
                {boardView?.postcard ? (
                  <Postcard scene={scene} postcard={boardView.postcard} className="album__postcard" />
                ) : (
                  <p className="album__card album__card--missing" data-postcard-remaining={remaining}>
                    <span className="album__missing-icon" aria-hidden>✉️</span>
                    {tf(remaining === 1 ? g.album.postcardRemainingOne : g.album.postcardRemaining, { remaining })}
                  </p>
                )}
              </div>
              <div className="album__discoveries">
                <h4 className="album__kind">{g.album.discoveries}</h4>
                <ul className="album__cards">
                  {board.discoveries.map((d) => {
                    const collected = boardView?.discoveries.find((x) => x.id === d.id)?.collected ?? false;
                    return (
                      <li key={d.id} className={`album__card${collected ? " album__card--got" : " album__card--missing"}`} data-discovery={d.id} data-collected={collected}>
                        {collected ? (
                          <AlbumCrop art={scene.art} crop={d.cardCrop} className="album__card-picture" label={tf(g.album.cardAria, { name: d.name })} />
                        ) : (
                          <span className="album__card-picture album__card-picture--blank" aria-hidden>?</span>
                        )}
                        <span className="album__card-name">{collected ? d.name : g.album.notYet}</span>
                        <span className="album__card-text">{collected ? d.description : tf(g.album.hintFor, { hint: d.hint })}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

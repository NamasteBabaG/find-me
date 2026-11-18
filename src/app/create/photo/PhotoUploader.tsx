"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/ui/Button";
import { navigateToSavedStep } from "../saved-step-navigation";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import Link from "next/link";
import { serviceCopy } from "@/domain/legal";
import { Icon } from "@/ui/Icon";
import { FramedPhoto } from "@/ui/FramedPhoto";
import { faceTooSmall, MAX_ZOOM, MIN_ZOOM, offsetFor, openingFrame, type FaceBox, type PhotoCrop } from "@/domain/photo-frame";
import { findFace, warmFaceFinder } from "./face-finder";

interface Props {
  childName: string;
  hasPhoto: boolean;
  rejectedCode: string | null;
  /** Where the photo goes. The draft route by default; a paid game that needs a new photo has its own. */
  endpoint?: string;
  /** Where to go once it is accepted. */
  nextHref?: string;
  /** The photo already saved on this draft, shown as the parent framed it. */
  saved?: { src: string; crop: PhotoCrop | null };
}

const BOX_MAX = 320;
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * The picture that actually goes over the wire.
 *
 * A phone photo is routinely 5-12MB and the serverless host rejects a request
 * body over 4.5MB before any of our code runs, so the parent would have got an
 * opaque failure on a perfectly ordinary photo of their child. (The one that
 * found this was 6.7MB.)
 *
 * Re-encoding also drops EXIF, which is where the camera writes the GPS
 * coordinates of the place the picture was taken — of a child. Nothing
 * downstream ever wanted it: the identity sheet is drawn at 1024px.
 *
 * The crop is sent separately and is normalised to the image, so resizing here
 * leaves it correct.
 */
const MAX_EDGE = 2048;

async function forUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // let the server judge a file we cannot even decode
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  return blob ?? file;
}

/** Looking for the face, found it, or not: the circle and its one line say which. */
type Look = "looking" | "found" | "missed" | "manual";

/**
 * Pick → the circle frames the face by itself → confirm.
 *
 * Guy (2026-11-18): the parent should not have to drag and zoom; the system
 * finds the face. The face is found on this device (face-finder.ts) while the
 * circle already shows the photo where a portrait puts a head; when the face
 * is found the photo glides to it. Dragging, the arrow keys and the zoom under
 * "Adjust" still decide, and they open by themselves when no face is found.
 * The crop is sent as a normalised box; the server makes the sticker.
 */
export function PhotoUploader({ childName, hasPhoto, rejectedCode, endpoint = "/api/drafts/photo", nextHref = "/create/scenes", saved }: Props) {
  const { t, tf, locale } = useI18n();
  const p = t.create.photo;
  const legal = serviceCopy[locale];
  // A guarded future step must not be prefetched before this photo exists.
  // Upload is a Route Handler mutation, not a cache-invalidating Server Action.
  const [file, setFile] = useState<File | null>(null);
  const preparedPhoto = useRef<{ file: File; promise: Promise<Blob | null> } | null>(null);
  useEffect(() => {
    // Resize/strip metadata while the parent looks at the crop, rather than
    // starting that work only after Continue is pressed. Nothing is uploaded.
    preparedPhoto.current = file ? { file, promise: forUpload(file).catch(() => null) } : null;
  }, [file]);
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(rejectedCode ? errorText(t, { code: rejectedCode }) : null);
  const [over, setOver] = useState(false);
  const [look, setLook] = useState<Look>("looking");
  const [small, setSmall] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  /** The photo glides to the found face; the parent's own moves follow the finger with no delay. */
  const [glide, setGlide] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  /** Once the parent moves the photo, a late answer from the face finder never moves it again. */
  const touched = useRef(false);
  const cropperRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  // The visible crop box is sized by CSS (--crop). The crop math must use the real size.
  const [BOX, setBox] = useState(BOX_MAX);

  // The detector loads while the parent is still choosing; the photo is never sent for it.
  useEffect(() => { void warmFaceFinder(); }, []);

  useEffect(() => {
    const el = cropperRef.current;
    if (!el) return;
    // The entrance animation scales painted bounds; cropping uses the stable layout size.
    const measure = () => setBox(el.clientWidth || BOX_MAX);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [url]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError(p.badType);
      return;
    }
    setError(null);
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setNatural(null);
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setLook("looking");
    setSmall(false);
    setAdjusting(false);
    setGlide(false);
    touched.current = false;
  };

  // The photo covers the circle at zoom 1; `zoom` scales it from there.
  const cover = natural ? Math.max(BOX / natural.w, BOX / natural.h) : 1;
  const scale = cover * zoom;
  const baseW = natural ? natural.w * cover : 0;
  const baseH = natural ? natural.h * cover : 0;
  const clampOffset = useCallback(
    (o: { x: number; y: number }, z = zoom) => natural
      ? { x: Math.min(0, Math.max(BOX - natural.w * cover * z, o.x)), y: Math.min(0, Math.max(BOX - natural.h * cover * z, o.y)) }
      : o,
    [natural, cover, zoom, BOX],
  );

  /** The parent takes over: no more automatic moves, no glide. */
  const takeOver = () => {
    touched.current = true;
    setGlide(false);
    setLook((l) => (l === "looking" ? "manual" : l));
  };

  /** Zoom about the middle of the circle, so the face stays where the parent put it. */
  const zoomTo = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    takeOver();
    setOffset((o) => clampOffset({ x: BOX / 2 - ((BOX / 2 - o.x) / zoom) * z, y: BOX / 2 - ((BOX / 2 - o.y) / zoom) * z }, z));
    setZoom(z);
  };

  /**
   * Open the circle on the face. First where a portrait puts a head, at once;
   * then, if the face finder answers before the parent has moved the photo,
   * the photo glides to the face. No face: the adjust controls open.
   */
  useEffect(() => {
    const image = imageRef.current;
    if (!natural || !image) return;
    let alive = true;
    const first = openingFrame(null, natural, BOX);
    setZoom(first.zoom);
    setOffset(offsetFor(first, natural, BOX));
    void (async () => {
      const face: FaceBox | null = await findFace(image);
      if (!alive || touched.current) return;
      if (!face) {
        setLook("missed");
        setAdjusting(true);
        return;
      }
      // Let the first framing paint, so the move to the face is seen as a move.
      if (typeof requestAnimationFrame === "function") await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!alive || touched.current) return;
      const framing = openingFrame(face, natural, BOX);
      setGlide(true);
      setZoom(framing.zoom);
      setOffset(offsetFor(framing, natural, BOX));
      setSmall(faceTooSmall(face, natural, BOX));
      setLook("found");
    })();
    return () => { alive = false; };
    // BOX is measured once per photo; a later resize keeps the parent's framing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    takeOver();
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clampOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }));
  };
  const onPointerUp = () => (drag.current = null);

  const upload = async () => {
    if (busy || !file || !natural || !consent) return;
    setBusy(true);
    setError(null);
    const crop = { x: -offset.x / scale / natural.w, y: -offset.y / scale / natural.h, w: BOX / scale / natural.w, h: BOX / scale / natural.h };
    let prepared: Blob;
    try {
      const ready = preparedPhoto.current?.file === file ? await preparedPhoto.current.promise : await forUpload(file);
      if (!ready) throw new Error("unreadable");
      prepared = ready;
    }
    catch {
      setError(p.unreadable);
      setBusy(false);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", prepared);
      fd.append("crop", JSON.stringify(crop));
      fd.append("consent", "1");
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({ ok: false, code: "UPLOAD_FAILED", reason: `HTTP ${res.status}` }))) as { ok: boolean; code?: string; reason?: string };
      if (!data.ok) {
        setError(errorText(t, { code: data.code ?? "UPLOAD_FAILED", reason: data.reason }) || p.failed);
        setBusy(false);
        return;
      }
      navigateToSavedStep(nextHref);
    } catch {
      setError(p.network);
      setBusy(false);
    }
  };

  /** "Change photo" opens the picker straight away: one tap, not a trip back to an empty box. */
  const changePhoto = (
    <label className="fm-btn fm-btn--secondary fm-btn--sm cropper__tool">
      <Icon name="camera" />
      {p.another}
      <input type="file" accept={ACCEPT} className="visually-hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
  const nextLabel = nextHref.startsWith("/create/scenes") ? p.next : t.common.continue;
  const status = look === "looking" ? p.looking : look === "missed" ? p.missed : look === "found" ? (small ? p.small : tf(p.found, { name: childName })) : "";

  return (
    <div className={`uploader uploader--${url ? "frame" : hasPhoto ? "saved" : "pick"}`}>
      {error ? (
        <div ref={errorRef} className="uploader__error">
          <Notice kind="danger">{error}</Notice>
        </div>
      ) : null}

      {url ? (
        <>
          <div className="uploader__stage">
            <div
              ref={cropperRef}
              className={`cropper cropper--${look}${glide ? " cropper--glide" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="img"
              aria-label={p.cropAria}
              aria-describedby="cropper-keys"
              tabIndex={0}
              // Dragging is not the only way: the arrows nudge the photo, + and − zoom it.
              onKeyDown={(e) => {
                const step = 12;
                const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                if (nudge[e.key]) {
                  e.preventDefault();
                  takeOver();
                  const [dx, dy] = nudge[e.key]!;
                  setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }));
                } else if (e.key === "+" || e.key === "=") {
                  e.preventDefault();
                  zoomTo(+(zoom + 0.1).toFixed(2));
                } else if (e.key === "-" || e.key === "_") {
                  e.preventDefault();
                  zoomTo(+(zoom - 0.1).toFixed(2));
                }
              }}
            >
              <span className="cropper__window">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={url}
                  alt=""
                  onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  onError={() => {
                    setError(p.unreadable);
                    setFile(null);
                    setUrl(null);
                    setNatural(null);
                  }}
                  style={{ width: baseW || undefined, height: baseH || undefined, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
                  draggable={false}
                />
              </span>
              <span className="cropper__ring" aria-hidden />
              <span className="cropper__pill" aria-hidden>{p.looking}</span>
              <span className="cropper__found" aria-hidden><Icon name="check" strokeWidth={3} /></span>
            </div>
            <span id="cropper-keys" className="visually-hidden">{p.cropKeys}</span>
            {/* Spoken always; shown only when the parent has something to do (no face, or a small one). */}
            <p className={`cropper__status${look === "missed" || small ? " cropper__status--ask" : " visually-hidden"}`} role="status">
              {status}
            </p>
            <div className="cropper__tools">
              {changePhoto}
              <button type="button" className={`fm-btn fm-btn--secondary fm-btn--sm cropper__tool${adjusting ? " cropper__tool--on" : ""}`}
                aria-expanded={adjusting} aria-controls="cropper-zoom" onClick={() => setAdjusting((a) => !a)}>
                <Icon name="search" />
                {p.adjust}
              </button>
            </div>
            <label id="cropper-zoom" className="cropper__zoom-row" hidden={!adjusting}>
              <span className="visually-hidden">{p.zoom}</span>
              {/* A small and a large glyph at the ends say which way is "more" without a word. */}
              <span className="cropper__zoom-glyph" aria-hidden><Icon name="search" /></span>
              <input type="range" className="cropper__zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} />
              <span className="cropper__zoom-glyph cropper__zoom-glyph--big" aria-hidden><Icon name="search" /></span>
            </label>
          </div>
          {/* The notice and the consent sit with the button they unlock. */}
          <div className="uploader__confirm">
            <p className="uploader__legal">{legal.photoNotice} <Link href="/privacy">{legal.privacy}</Link> · <Link href="/support">{legal.support}</Link></p>
            {/* The tick is the product's own: a sun-filled rounded box, not the
                operating system's blue square. The whole label is the target. */}
            <label className="uploader__consent">
              <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span className="uploader__tick" aria-hidden><Icon name="check" strokeWidth={3} /></span>
              <span>{p.consent}</span>
            </label>
            <Button size="lg" block onClick={upload} loading={busy} disabled={!natural || !consent}>
              {p.confirm}
              <span className="fm-btn__arrow" aria-hidden />
            </Button>
          </div>
        </>
      ) : hasPhoto ? (
        <>
          <div className="uploader__stage">
            <span className="cropper cropper--saved">
              {saved ? <FramedPhoto src={saved.src} crop={saved.crop} size="100%" /> : <Icon name="camera" />}
            </span>
            <div className="cropper__tools">{changePhoto}</div>
          </div>
          <div className="uploader__confirm">
            <a className="fm-btn fm-btn--lg fm-btn--block" href={nextHref}>
              {nextLabel}
              <span className="fm-btn__arrow" aria-hidden />
            </a>
          </div>
        </>
      ) : (
        <>
          <label
            className={`dropzone${over ? " dropzone--over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files[0]);
            }}
          >
            <span className="dropzone__slot" aria-hidden>
              <Icon name="camera" />
            </span>
            <span className="fm-btn fm-btn--lg dropzone__button">{p.pickButton}</span>
            <input type="file" accept={ACCEPT} className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <ul className="tips__list" aria-label={p.tipsTitle}>
            {p.tips.map((tip) => (
              <li key={tip}><Icon name="check" className="fm-icon tips__mark" strokeWidth={2.6} />{tip}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

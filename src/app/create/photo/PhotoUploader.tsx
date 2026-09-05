"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/primitives";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";

interface Props {
  childName: string;
  hasPhoto: boolean;
  rejectedCode: string | null;
  /** Where the photo goes. The draft route by default; a paid game that needs a new photo has its own. */
  endpoint?: string;
  /** Where to go once it is accepted. */
  nextHref?: string;
}

const BOX_MAX = 320;

/**
 * Pick → crop (drag + zoom inside a circle) → upload.
 * The crop is sent as a normalized box; the server makes the sticker.
 */
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
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  return blob ?? file;
}

export function PhotoUploader({ childName, hasPhoto, rejectedCode, endpoint = "/api/drafts/photo", nextHref = "/create/package" }: Props) {
  const { t, tf } = useI18n();
  const p = t.create.photo;
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(rejectedCode ? errorText(t, { code: rejectedCode }) : null);
  const [over, setOver] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const cropperRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  // The visible crop box: 320px on desktop, narrower on phones. The crop math must use the real size.
  const [BOX, setBox] = useState(BOX_MAX);

  useEffect(() => {
    const el = cropperRef.current;
    if (!el) return;
    const measure = () => setBox(Math.round(el.getBoundingClientRect().width) || BOX_MAX);
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
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Base scale so the image covers the circle.
  const base = natural ? Math.max(BOX / natural.w, BOX / natural.h) : 1;
  const scale = base * zoom;
  const drawW = natural ? natural.w * scale : 0;
  const drawH = natural ? natural.h * scale : 0;
  const clampOffset = useCallback(
    (o: { x: number; y: number }) => ({ x: Math.min(0, Math.max(BOX - drawW, o.x)), y: Math.min(0, Math.max(BOX - drawH, o.y)) }),
    [drawW, drawH],
  );

  useEffect(() => {
    if (natural) setOffset((o) => clampOffset({ x: o.x === 0 && o.y === 0 ? (BOX - drawW) / 2 : o.x, y: o.x === 0 && o.y === 0 ? (BOX - drawH) / 2 : o.y }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clampOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }));
  };
  const onPointerUp = () => (drag.current = null);

  const upload = async () => {
    if (!file || !natural || !consent) return;
    setBusy(true);
    setError(null);
    const crop = { x: -offset.x / scale / natural.w, y: -offset.y / scale / natural.h, w: BOX / scale / natural.w, h: BOX / scale / natural.h };
    const fd = new FormData();
    fd.append("file", await forUpload(file));
    fd.append("crop", JSON.stringify(crop));
    fd.append("consent", "1");
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({ ok: false, code: "UPLOAD_FAILED", reason: `HTTP ${res.status}` }))) as { ok: boolean; code?: string; reason?: string };
      if (!data.ok) {
        setError(errorText(t, { code: data.code ?? "UPLOAD_FAILED", reason: data.reason }) || p.failed);
        setBusy(false);
        return;
      }
      router.push(nextHref);
    } catch {
      setError(p.network);
      setBusy(false);
    }
  };

  const consentBox = (
    <label className="uploader__consent">
      <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
      <span>{p.consent}</span>
    </label>
  );

  return (
    <div className="uploader">
      {error ? (
        <div ref={errorRef} className="uploader__error">
          <Notice kind="danger">{error}</Notice>
        </div>
      ) : null}

      {!url ? (
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
            <span className="dropzone__icon" aria-hidden>
              📷
            </span>
            <span className="fm-label">{tf(p.pick, { name: childName })}</span>
            <span className="fm-hint">{p.pickHint}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <span className="fm-btn fm-btn--secondary">{p.pickButton}</span>
          </label>
          <div className="tips">
            <p className="tips__title">{p.tipsTitle}</p>
            <ul className="tips__list">
              {p.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
          {consentBox}
          {hasPhoto ? (
            <div className="create__actions" style={{ width: "100%" }}>
              <Notice kind="success">{p.hasPhoto}</Notice>
              <LinkButton href="/create/package">
                {t.common.continue}
                <span className="fm-btn__arrow" aria-hidden>
                  ➜
                </span>
              </LinkButton>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="fm-lead fm-center">{p.cropLead}</p>
          <div
            ref={cropperRef}
            className="cropper"
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
                const [dx, dy] = nudge[e.key]!;
                setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }));
              } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)));
              } else if (e.key === "-" || e.key === "_") {
                e.preventDefault();
                setZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)));
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => {
                setError(p.unreadable);
                setFile(null);
                setUrl(null);
                setNatural(null);
              }}
              style={{ width: drawW || undefined, height: drawH || undefined, transform: `translate(${offset.x}px, ${offset.y}px)` }}
              draggable={false}
            />
            <div className="cropper__ring" aria-hidden />
          </div>
          <label className="fm-field" style={{ alignItems: "center" }}>
            <span className="fm-hint">{p.zoom}</span>
            <span id="cropper-keys" className="visually-hidden">
              {p.cropKeys}
            </span>
            <input type="range" className="cropper__zoom" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          {consentBox}
          <div className="create__actions create__actions--sticky" style={{ width: "100%" }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setFile(null);
                setUrl(null);
                setNatural(null);
              }}
            >
              {p.another}
            </Button>
            <Button size="lg" onClick={upload} loading={busy} disabled={!natural || !consent}>
              {p.confirm}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </Button>
          </div>
        </>
      )}
      <p className="fm-small fm-center">{p.privacy}</p>
    </div>
  );
}

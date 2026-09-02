"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/ui/Button";
import { Notice } from "@/ui/Shell";

interface Props {
  childName: string;
  hasPhoto: boolean;
  rejectedReason: string | null;
}

const TIPS = ["😊 פנים ברורות", "☀️ תאורה טובה", "🧍 אדם אחד בתמונה", "🧢 בלי כובע שמסתיר", "📸 מהכתפיים ומעלה"];

/**
 * Pick → crop (drag + zoom inside a circle) → upload.
 * The crop is sent as a normalized box; the server makes the sticker.
 */
export function PhotoUploader({ childName, hasPhoto, rejectedReason }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(rejectedReason);
  const [over, setOver] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const BOX = 320;

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("אפשר להעלות JPG, PNG או WebP.");
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
    (o: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(BOX - drawW, o.x)),
      y: Math.min(0, Math.max(BOX - drawH, o.y)),
    }),
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
    if (!file || !natural) return;
    setBusy(true);
    setError(null);
    // Visible circle in image pixels → normalized crop box.
    const crop = { x: -offset.x / scale / natural.w, y: -offset.y / scale / natural.h, w: BOX / scale / natural.w, h: BOX / scale / natural.h };
    const fd = new FormData();
    fd.append("file", file);
    fd.append("crop", JSON.stringify(crop));
    try {
      const res = await fetch("/api/drafts/photo", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; reason?: string };
      if (!data.ok) {
        setError(data.reason ?? "משהו השתבש. נסו תמונה אחרת.");
        setBusy(false);
        return;
      }
      router.push("/create/package");
    } catch {
      setError("החיבור נכשל. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <div className="uploader">
      {error ? <Notice kind="danger">{error}</Notice> : null}

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
            <span className="fm-label">בוחרים תמונה של {childName}</span>
            <span className="fm-hint">JPG, PNG או WebP · עד 12MB · אפשר גם לגרור לכאן</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <span className="fm-btn fm-btn--secondary">בחירת תמונה</span>
          </label>
          <ul className="tips" aria-label="טיפים לתמונה טובה">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {hasPhoto ? (
            <div className="create__actions" style={{ width: "100%" }}>
              <Notice kind="success">כבר יש תמונה מאושרת. אפשר להחליף או להמשיך.</Notice>
              <LinkButton href="/create/package">ממשיכים ➜</LinkButton>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="fm-lead fm-center">מזיזים ומגדילים כך שהפנים ימלאו את העיגול.</p>
          <div className="cropper" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} role="img" aria-label="חיתוך התמונה">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{ width: drawW || undefined, height: drawH || undefined, transform: `translate(${offset.x}px, ${offset.y}px)` }}
              draggable={false}
            />
            <div className="cropper__ring" aria-hidden />
          </div>
          <label className="fm-field" style={{ alignItems: "center" }}>
            <span className="fm-hint">הגדלה</span>
            <input type="range" className="cropper__zoom" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <div className="create__actions" style={{ width: "100%" }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setFile(null);
                setUrl(null);
                setNatural(null);
              }}
            >
              תמונה אחרת
            </Button>
            <Button size="lg" onClick={upload} loading={busy} disabled={!natural}>
              זו התמונה ➜
            </Button>
          </div>
        </>
      )}
      <p className="fm-small fm-center">התמונה משמשת רק ליצירת הדמות ונמחקת אחרי אישור המשחק.</p>
    </div>
  );
}

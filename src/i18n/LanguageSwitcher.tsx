"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { LOCALES, type Locale } from "./config";
import { useI18n } from "./client";
import { setLocaleAction } from "./actions";

const CODES: Record<Locale, string> = { en: "EN", he: "HE" };

/**
 * Inline SVG flags: emoji flags don't render on Windows (they fall back to
 * letters), so the header draws its own tiny, simplified flags.
 */
function Flag({ locale }: { locale: Locale }) {
  const clipId = useId();
  if (locale === "he") {
    return (
      <svg className="fm-flag" viewBox="0 0 24 18" aria-hidden focusable="false">
        <rect width="24" height="18" rx="2.5" fill="#ffffff" />
        <rect y="2.4" width="24" height="2.7" fill="#0038b8" />
        <rect y="12.9" width="24" height="2.7" fill="#0038b8" />
        <path d="M12 5.3 15.2 10.8 8.8 10.8Z M12 12.7 8.8 7.2 15.2 7.2Z" fill="none" stroke="#0038b8" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    );
  }
  const stripe = 18 / 13;
  return (
    <svg className="fm-flag" viewBox="0 0 24 18" aria-hidden focusable="false">
      <defs>
        <clipPath id={clipId}>
          <rect width="24" height="18" rx="2.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="24" height="18" fill="#ffffff" />
        {[0, 2, 4, 6, 8, 10, 12].map((i) => (
          <rect key={i} y={i * stripe} width="24" height={stripe} fill="#b22234" />
        ))}
        <rect width="10" height={stripe * 7} fill="#3c3b6e" />
        {[1.7, 4.3, 6.9].map((y) =>
          [1.6, 4.2, 6.8].map((x) => <circle key={`${x}-${y}`} cx={x + (y === 4.3 ? 1.3 : 0)} cy={y} r="0.55" fill="#ffffff" />),
        )}
      </g>
    </svg>
  );
}

/** Header language menu: shows the current language (flag + code); the menu lists both languages by their native names. */
export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number>(LOCALES.indexOf(locale));
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) items.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const choose = (next: Locale) => {
    if (pending) return;
    setOpen(false);
    trigger.current?.focus();
    if (next === locale) return;
    start(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  };

  return (
    <div className="fm-lang" ref={ref} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button
        ref={trigger}
        type="button"
        className="fm-lang__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t.common.language}
        title={t.common.language}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={() => {
          if (pending) return;
          setActiveIndex(LOCALES.indexOf(locale));
          setOpen((o) => !o);
        }}
        onKeyDown={(event) => {
          if (pending || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          event.preventDefault();
          setActiveIndex(event.key === "ArrowUp" ? LOCALES.length - 1 : 0);
          setOpen(true);
        }}
      >
        <Flag locale={locale} />
        <span className="fm-lang__code">{CODES[locale]}</span>
        <span className="fm-lang__chev" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="fm-lang__menu" role="menu" id={menuId} aria-label={t.common.language} onKeyDown={(event) => {
          if (event.key === "Tab" && event.shiftKey) {
            event.preventDefault();
            setOpen(false);
            trigger.current?.focus();
            return;
          }
          let next = activeIndex;
          if (event.key === "ArrowDown") next = (activeIndex + 1) % LOCALES.length;
          else if (event.key === "ArrowUp") next = (activeIndex - 1 + LOCALES.length) % LOCALES.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = LOCALES.length - 1;
          else return;
          event.preventDefault();
          setActiveIndex(next);
        }}>
          {LOCALES.map((l, index) => (
            <button
              key={l}
              ref={(element) => { items.current[index] = element; }}
              type="button"
              tabIndex={index === activeIndex ? 0 : -1}
              onFocus={() => setActiveIndex(index)}
              role="menuitemradio"
              aria-checked={l === locale}
              className={`fm-lang__item${l === locale ? " is-active" : ""}`}
              onClick={() => choose(l)}
              lang={l}
            >
              <Flag locale={l} />
              <span className="fm-lang__name">{t.common.languages[l]}</span>
              <span className="fm-lang__code">{CODES[l]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

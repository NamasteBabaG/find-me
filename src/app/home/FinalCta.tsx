"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { createHref, displayName, useNameStore } from "./name-store";

export function FinalCta() {
  const { t, tf } = useI18n();
  const f = t.home.final;
  const raw = useNameStore((s) => s.raw);
  const name = displayName(raw, t.home.defaultName);
  return (
    <section className="final">
      <div className="fm-container">
        <div className="fm-sheet final__sheet">
          <span className="fm-sticker-badge">{f.badge}</span>
          <h2 className="final__title">{tf(f.title, { name })}</h2>
          <p className="final__lead">{f.lead}</p>
          <div className="final__cta fm-row fm-row--center">
            <Link href={createHref(raw)} className="fm-btn fm-btn--night fm-btn--xl">
              {tf(f.cta, { name })}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </Link>
            <a href="#pricing" className="fm-btn fm-btn--white fm-btn--lg">
              {f.pricing}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

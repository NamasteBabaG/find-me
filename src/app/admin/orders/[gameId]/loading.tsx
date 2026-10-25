"use client";

import { useI18n } from "@/i18n/client";

/** Flush the authenticated route shell while its read-only repair plans load. */
export default function AdminOrderLoading() {
  const { t } = useI18n();
  return <section className="fm-card fm-card--pad-6 fm-stack fm-stack--3" aria-busy="true">
    <p role="status"><span className="fm-spinner" aria-hidden="true" /> {t.common.loading}</p>
  </section>;
}

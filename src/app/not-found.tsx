import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3 fm-center">
      <span style={{ fontSize: "var(--fs-800)", lineHeight: 1 }} aria-hidden>
        🙈
      </span>
      <h1>{t.notFound.title}</h1>
      <p className="fm-lead">{t.notFound.lead}</p>
      <Link href="/" className="fm-btn">
        {t.common.home}
      </Link>
    </main>
  );
}

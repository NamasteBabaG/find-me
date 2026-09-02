import Link from "next/link";

export default function NotFound() {
  return (
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3 fm-center">
      <span style={{ fontSize: "var(--fs-800)", lineHeight: 1 }} aria-hidden>
        🙈
      </span>
      <h1>הדף הזה התחבא טוב מדי</h1>
      <p className="fm-lead">לא מצאנו את מה שחיפשתם.</p>
      <Link href="/" className="fm-btn">
        לדף הבית
      </Link>
    </main>
  );
}

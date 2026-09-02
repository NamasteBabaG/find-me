import Link from "next/link";
import { notFound } from "next/navigation";
import { findScene } from "../../../../../content/scenes";
import { buildDemoConfig } from "@/services/demo";
import { StaticScenePreview } from "@/game/components/StaticScenePreview";

/** Level-design view: both hiding-spot variants with hint zones, plus the raw slot table. */
export default async function AdminScenePreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const scene = findScene(slug);
  if (!scene) notFound();
  const demo = buildDemoConfig("he", slug).scenes[0]!;
  return (
    <div className="fm-stack fm-stack--3">
      <Link href="/admin/scenes" className="fm-small">
        ➜ כל העולמות
      </Link>
      <h1>
        {scene.name.he} <span className="fm-badge fm-badge--outline">v{scene.version}</span> <span className="fm-badge fm-badge--outline">{scene.artStatus}</span>
      </h1>
      <p className="fm-muted">{scene.tagline.he}</p>
      <div className="fm-grid">
        <div className="fm-stack fm-stack--1">
          <strong>מיקום A (משחק ראשון)</strong>
          <StaticScenePreview scene={demo} variant="A" showZones />
        </div>
        <div className="fm-stack fm-stack--1">
          <strong>מיקום B (משחק חוזר)</strong>
          <StaticScenePreview scene={demo} variant="B" showZones />
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="fm-table">
          <thead>
            <tr>
              <th>משימה</th>
              <th>קושי</th>
              <th>slot</th>
              <th>x</th>
              <th>y</th>
              <th>scale</th>
              <th>שכבה</th>
              <th>רמז</th>
            </tr>
          </thead>
          <tbody>
            {scene.targets.flatMap((t) =>
              t.slots.map((s, i) => (
                <tr key={s.id}>
                  <td>{i === 0 ? t.mission.he : ""}</td>
                  <td>{i === 0 ? t.difficulty : ""}</td>
                  <td dir="ltr">{s.id}</td>
                  <td>{s.x}</td>
                  <td>{s.y}</td>
                  <td>{s.scale}</td>
                  <td>{s.layer}</td>
                  <td>{s.hintText.he}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="fm-card fm-stack fm-stack--1">
        <strong>אינטראקציות סביבתיות</strong>
        <ul className="fm-small">
          {scene.ambient.map((a) => (
            <li key={a.id}>
              {a.glyph} {a.label.he} — ({a.x}, {a.y}) · {a.animation} · {a.reaction?.he}
            </li>
          ))}
        </ul>
        <strong>חגיגה</strong>
        <span className="fm-small">
          {scene.celebration.kind} · {scene.celebration.completeText.he} · פריט: {scene.collectible.icon} {scene.collectible.name.he}
        </span>
      </div>
    </div>
  );
}

/**
 * `npm run scenes:validate` — validates every scene definition and prints
 * warnings. Exit code 1 on errors, so it can gate CI.
 */
import { SCENE_CATALOG } from "../content/scenes";
import { BODY_TEMPLATES } from "../content/body-templates";

let failed = false;
for (const { scene, warnings } of SCENE_CATALOG) {
  const missing = scene.targets.filter((t) => !BODY_TEMPLATES[t.bodyTemplate]).map((t) => t.bodyTemplate);
  const status = missing.length ? "✗" : "✓";
  console.log(`${status} ${scene.slug.padEnd(10)} v${scene.version}  ${scene.active ? "active " : "inactive"}  art:${scene.artStatus}`);
  for (const m of missing) {
    console.log(`    ✗ unknown body template "${m}"`);
    failed = true;
  }
  for (const w of warnings) console.log(`    ⚠ ${w}`);
}
if (failed) process.exit(1);

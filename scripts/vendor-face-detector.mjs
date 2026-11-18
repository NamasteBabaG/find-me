// The photo step finds the child's face in the browser (src/app/create/photo/face-finder.ts) with
// MediaPipe's face detector. Its WebAssembly runtime ships inside the npm package, 14 MB of it, so it
// is copied into public/ at install and build time instead of being committed. The model itself
// (public/models/blaze_face_short_range.tflite, 230 KB) is not in the package and is committed.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const from = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = path.join(root, "public", "vendor", "mediapipe");
mkdirSync(to, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) copyFileSync(path.join(from, file), path.join(to, file));

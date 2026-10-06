/* iPad frame meter, a bookmarklet for measuring the board in Safari without a code change (docs/CLAUDE_WEAK_DEVICE_PERFORMANCE_20261006.md, section 8).
   It measures frame gaps (requestAnimationFrame) and input delay (pointermove) for 10 s, and switches where the --lit-art lift sits:
   on the window (as shipped), on the art, or nowhere. It sends and stores nothing. ipad-frame-meter.bookmarklet.txt is this file
   as one line (comments are block comments only, so the line stays valid). */
(() => {
  if (window.__fmMeter) { window.__fmMeter(); return; }
  const ART = ".stage__base,.stage__layer--fg,.stage__target,.stage__bonus,.stage__ambient";
  const SKY = ".viewport::before{content:'';position:absolute;inset:0;background:inherit;filter:var(--lit-art);pointer-events:none}";
  const VARIANTS = [
    ["חלון (נוכחי)", ""],
    ["על הארט", ".viewport{filter:none!important}" + SKY + ART + "{filter:var(--lit-art)}"],
    ["בלי פילטר", ".viewport{filter:none!important}"],
  ];
  let variant = 0, running = false, frames = [], delays = [];
  const style = document.createElement("style");
  document.head.appendChild(style);
  const box = document.createElement("div");
  box.setAttribute("style", "position:fixed;top:8px;left:8px;z-index:2147483647;background:#fff;color:#111;font:14px/1.4 -apple-system,sans-serif;padding:10px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:min(560px,90vw);direction:rtl");
  const btn = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("style", "min-height:44px;min-width:44px;margin:0 0 6px 6px;padding:0 12px;font:inherit;border:1px solid #888;border-radius:8px;background:#f4f4f4;color:#111");
    b.onclick = (e) => { e.stopPropagation(); fn(b); };
    box.appendChild(b);
    return b;
  };
  const out = document.createElement("pre");
  out.setAttribute("style", "margin:6px 0 0;white-space:pre-wrap;direction:ltr;text-align:left;font:12px/1.4 ui-monospace,Menlo,monospace;user-select:text;-webkit-user-select:text");
  const q = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const loop = (t) => { if (!running) return; frames.push(t); requestAnimationFrame(loop); };
  const onMove = (e) => { if (running && e.timeStamp > 0) delays.push(performance.now() - e.timeStamp); };
  addEventListener("pointermove", onMove, { capture: true, passive: true });
  const close = () => { running = false; removeEventListener("pointermove", onMove, { capture: true }); style.remove(); box.remove(); window.__fmMeter = null; };
  const finish = (b) => {
    running = false;
    b.textContent = "מדידה 10 שניות";
    const gaps = [];
    for (let i = 1; i < frames.length; i++) gaps.push(frames[i] - frames[i - 1]);
    const s = [...gaps].sort((x, y) => x - y), d = [...delays].sort((x, y) => x - y);
    const over = (ms) => (gaps.filter((g) => g > ms).length / Math.max(1, gaps.length) * 100).toFixed(1) + "pct";
    const secs = frames.length > 1 ? (frames[frames.length - 1] - frames[0]) / 1000 : 0;
    const line = [
      "filter=" + ["window", "art", "none"][variant],
      "screen=" + innerWidth + "x" + innerHeight + "@" + devicePixelRatio,
      "fps=" + (secs ? (gaps.length / secs).toFixed(1) : "-"),
      "p50=" + (s.length ? q(s, 0.5).toFixed(1) : "-"),
      "p95=" + (s.length ? q(s, 0.95).toFixed(1) : "-"),
      "max=" + (s.length ? s[s.length - 1].toFixed(0) : "-"),
      "over20=" + over(20), "over33=" + over(33.4), "over50=" + over(50),
      "input_p50=" + (d.length ? q(d, 0.5).toFixed(1) : "-"),
      "input_p95=" + (d.length ? q(d, 0.95).toFixed(1) : "-"),
      "moves=" + d.length,
    ].join(" ");
    out.textContent = line + "\n" + out.textContent;
  };
  btn("מדידה 10 שניות", (b) => {
    if (running) return;
    frames = []; delays = []; running = true;
    requestAnimationFrame(loop);
    let left = 10;
    b.textContent = "גררו וצבטו… " + left;
    const tick = setInterval(() => { left -= 1; b.textContent = "גררו וצבטו… " + left; if (left <= 0) { clearInterval(tick); finish(b); } }, 1000);
  });
  btn("פילטר: " + VARIANTS[0][0], (b) => { variant = (variant + 1) % VARIANTS.length; style.textContent = VARIANTS[variant][1]; b.textContent = "פילטר: " + VARIANTS[variant][0]; });
  btn("×", close).setAttribute("aria-label", "סגירה");
  box.appendChild(out);
  document.body.appendChild(box);
  window.__fmMeter = close;
})();

/* iPad frame meter, a bookmarklet for measuring the board in Safari without a code change (docs/CLAUDE_WEAK_DEVICE_PERFORMANCE_20261006.md, section 8).
   For 10 s it records two auxiliary indicators: the gaps between requestAnimationFrame callbacks, and how late each pointermove reaches a
   listener. Neither is every frame actually shown, nor input-to-visual latency; audible sound is measured separately. It also switches
   where the --lit-art lift sits (the window as shipped, the art, nowhere); the switch is locked while a measurement runs, a measurement
   stops if the page is hidden, and closing stops every timer it started. It sends and stores nothing.
   ipad-frame-meter.bookmarklet.txt is this file as one line (block comments only, so the line stays valid). */
(() => {
  if (window.__fmMeter) { window.__fmMeter(); return; }
  const ART = ".stage__base,.stage__layer--fg,.stage__target,.stage__bonus,.stage__ambient";
  const SKY = ".viewport::before{content:'';position:absolute;inset:0;background:inherit;filter:var(--lit-art);pointer-events:none}";
  const VARIANTS = [
    ["window", "חלון (נוכחי)", ""],
    ["art", "על הארט", ".viewport{filter:none!important}" + SKY + ART + "{filter:var(--lit-art)}"],
    ["none", "בלי פילטר", ".viewport{filter:none!important}"],
  ];
  const MEASURE = "מדידה 10 שניות";
  let variant = 0, run = null;
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
  const legend = document.createElement("p");
  legend.setAttribute("style", "margin:0 0 6px;font-size:12px;color:#444");
  legend.textContent = "מדדי עזר: פערים בין קריאות requestAnimationFrame, ועיכוב הגעת pointermove למאזין. לא כל פריים שהוצג, ולא קלט עד תגובה חזותית.";
  const out = document.createElement("pre");
  out.setAttribute("style", "margin:6px 0 0;white-space:pre-wrap;direction:ltr;text-align:left;font:12px/1.4 ui-monospace,Menlo,monospace;user-select:text;-webkit-user-select:text");
  const q = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const loop = (t) => { if (!run) return; run.frames.push(t); run.raf = requestAnimationFrame(loop); };
  const onMove = (e) => { if (run && e.timeStamp > 0) run.delays.push(performance.now() - e.timeStamp); };
  const report = (r) => {
    const gaps = [];
    for (let i = 1; i < r.frames.length; i++) gaps.push(r.frames[i] - r.frames[i - 1]);
    const s = [...gaps].sort((x, y) => x - y), d = [...r.delays].sort((x, y) => x - y);
    const over = (ms) => (gaps.filter((g) => g > ms).length / Math.max(1, gaps.length) * 100).toFixed(1) + "pct";
    const secs = r.frames.length > 1 ? (r.frames[r.frames.length - 1] - r.frames[0]) / 1000 : 0;
    return [
      "filter=" + VARIANTS[r.variant][0],
      "screen=" + innerWidth + "x" + innerHeight + "@" + devicePixelRatio,
      "raf_per_s=" + (secs ? (gaps.length / secs).toFixed(1) : "-"),
      "raf_gap_p50=" + (s.length ? q(s, 0.5).toFixed(1) : "-"),
      "raf_gap_p95=" + (s.length ? q(s, 0.95).toFixed(1) : "-"),
      "raf_gap_max=" + (s.length ? s[s.length - 1].toFixed(0) : "-"),
      "gaps_over20=" + over(20), "gaps_over33=" + over(33.4), "gaps_over50=" + over(50),
      "pointermove_delay_p50=" + (d.length ? q(d, 0.5).toFixed(1) : "-"),
      "pointermove_delay_p95=" + (d.length ? q(d, 0.95).toFixed(1) : "-"),
      "moves=" + d.length,
    ].join(" ");
  };
  const stop = (reason) => {
    if (!run) return;
    const r = run;
    run = null;
    clearInterval(r.tick);
    cancelAnimationFrame(r.raf);
    measureBtn.textContent = MEASURE;
    filterBtn.disabled = false;
    if (reason !== null) out.textContent = (reason ? "aborted: " + reason + " (filter=" + VARIANTS[r.variant][0] + ")" : report(r)) + "\n" + out.textContent;
  };
  const onVisibility = () => { if (document.hidden) stop("page hidden"); };
  addEventListener("pointermove", onMove, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  const close = () => {
    stop(null);
    removeEventListener("pointermove", onMove, { capture: true });
    document.removeEventListener("visibilitychange", onVisibility);
    style.remove();
    box.remove();
    window.__fmMeter = null;
  };
  box.appendChild(legend);
  const measureBtn = btn(MEASURE, (b) => {
    if (run) return;
    run = { variant, frames: [], delays: [], raf: 0, tick: 0, left: 10 };
    filterBtn.disabled = true;
    run.raf = requestAnimationFrame(loop);
    b.textContent = "גררו וצבטו… " + run.left;
    run.tick = setInterval(() => { if (!run) return; run.left -= 1; b.textContent = "גררו וצבטו… " + run.left; if (run.left <= 0) stop(""); }, 1000);
  });
  const filterBtn = btn("פילטר: " + VARIANTS[0][1], (b) => {
    if (run) return;
    variant = (variant + 1) % VARIANTS.length;
    style.textContent = VARIANTS[variant][2];
    b.textContent = "פילטר: " + VARIANTS[variant][1];
  });
  btn("×", close).setAttribute("aria-label", "סגירה");
  box.appendChild(out);
  document.body.appendChild(box);
  window.__fmMeter = close;
})();

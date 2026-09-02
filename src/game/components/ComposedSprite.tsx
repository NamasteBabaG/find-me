import { BODY_TEMPLATES, type BodyTemplate } from "../../../content/body-templates";

/**
 * Procedural "paper cut-out" body + the child's face sticker.
 * viewBox is 100×140 (COMPOSED_SPRITE_ASPECT). Used in the scene, on the
 * mission card, in the admin review and in the landing demo.
 */
export function ComposedSprite({ faceUrl, bodyTemplate, className, title }: { faceUrl: string; bodyTemplate: string; className?: string; title?: string }) {
  const t: BodyTemplate = BODY_TEMPLATES[bodyTemplate] ?? BODY_TEMPLATES.beach_float!;
  const { primary, secondary } = t.outfit;
  const ink = "#2B2A33";
  const skin = "#F5C9A5";
  const glyph = t.accessory.glyph;

  const accessory = (x: number, y: number, size = 30) =>
    glyph ? (
      <text x={x} y={y} fontSize={size} textAnchor="middle" dominantBaseline="middle" style={{ userSelect: "none" }}>
        {glyph}
      </text>
    ) : null;

  const face = (cx: number, cy: number, r: number) => (
    <g>
      <circle cx={cx} cy={cy} r={r + 2} fill="#fff" />
      <image href={faceUrl} x={cx - r} y={cy - r} width={r * 2} height={r * 2} clipPath={`circle(${r}px at ${cx}px ${cy}px)`} preserveAspectRatio="xMidYMid slice" />
    </g>
  );

  let body: React.ReactNode;
  switch (t.pose) {
    case "peeking":
      body = (
        <g>
          {face(50, 40, 26)}
          <ellipse cx="32" cy="72" rx="10" ry="7" fill={skin} stroke={ink} strokeWidth="2" />
          <ellipse cx="68" cy="72" rx="10" ry="7" fill={skin} stroke={ink} strokeWidth="2" />
          <rect x="30" y="66" width="40" height="18" rx="8" fill={primary} stroke={ink} strokeWidth="2" />
        </g>
      );
      break;
    case "sitting":
      body = (
        <g>
          <rect x="30" y="62" width="40" height="44" rx="14" fill={primary} stroke={ink} strokeWidth="2" />
          <rect x="18" y="98" width="30" height="14" rx="7" fill={secondary} stroke={ink} strokeWidth="2" />
          <rect x="52" y="98" width="30" height="14" rx="7" fill={secondary} stroke={ink} strokeWidth="2" />
          <circle cx="24" cy="86" r="7" fill={skin} stroke={ink} strokeWidth="2" />
          <circle cx="76" cy="86" r="7" fill={skin} stroke={ink} strokeWidth="2" />
          {face(50, 36, 26)}
          {t.accessory.place !== "none" ? accessory(50, 124, 34) : null}
        </g>
      );
      break;
    case "riding":
      body = (
        <g>
          <rect x="32" y="60" width="36" height="40" rx="12" fill={primary} stroke={ink} strokeWidth="2" />
          <circle cx="26" cy="80" r="7" fill={skin} stroke={ink} strokeWidth="2" />
          <circle cx="74" cy="80" r="7" fill={skin} stroke={ink} strokeWidth="2" />
          {face(50, 34, 26)}
          {accessory(50, 118, 44)}
        </g>
      );
      break;
    case "floating":
      body = (
        <g transform="rotate(-18 50 70)">
          <rect x="32" y="60" width="36" height="46" rx="14" fill={primary} stroke={ink} strokeWidth="2" />
          <rect x="10" y="62" width="24" height="12" rx="6" fill={secondary} stroke={ink} strokeWidth="2" transform="rotate(-30 22 68)" />
          <rect x="66" y="62" width="24" height="12" rx="6" fill={secondary} stroke={ink} strokeWidth="2" transform="rotate(30 78 68)" />
          <rect x="34" y="102" width="12" height="26" rx="6" fill={secondary} stroke={ink} strokeWidth="2" transform="rotate(20 40 115)" />
          <rect x="54" y="102" width="12" height="26" rx="6" fill={secondary} stroke={ink} strokeWidth="2" transform="rotate(-20 60 115)" />
          <circle cx="50" cy="34" r="30" fill="none" stroke="#7CD0EC" strokeWidth="4" opacity="0.8" />
          {face(50, 34, 24)}
          {t.accessory.place !== "none" ? accessory(84, 44, 22) : null}
        </g>
      );
      break;
    case "waving":
    case "saluting":
    case "holding":
    case "standing":
    default: {
      const armUp = t.pose === "waving" || t.pose === "saluting";
      const hold = t.pose === "holding";
      body = (
        <g>
          <rect x="32" y="60" width="36" height="48" rx="14" fill={primary} stroke={ink} strokeWidth="2" />
          {/* legs */}
          <rect x="35" y="104" width="12" height="28" rx="6" fill={secondary} stroke={ink} strokeWidth="2" />
          <rect x="53" y="104" width="12" height="28" rx="6" fill={secondary} stroke={ink} strokeWidth="2" />
          <ellipse cx="41" cy="133" rx="9" ry="4" fill={ink} />
          <ellipse cx="59" cy="133" rx="9" ry="4" fill={ink} />
          {/* arms */}
          <rect x="16" y="64" width="18" height="10" rx="5" fill={primary} stroke={ink} strokeWidth="2" transform={hold ? "rotate(-40 25 69)" : "rotate(25 25 69)"} />
          {armUp ? (
            <rect x="66" y="40" width="10" height="30" rx="5" fill={primary} stroke={ink} strokeWidth="2" transform={t.pose === "saluting" ? "rotate(-50 71 55)" : "rotate(10 71 55)"} />
          ) : (
            <rect x="66" y="64" width="18" height="10" rx="5" fill={primary} stroke={ink} strokeWidth="2" transform={hold ? "rotate(40 75 69)" : "rotate(-25 75 69)"} />
          )}
          <circle cx={armUp ? 72 : hold ? 84 : 12} cy={armUp ? 36 : hold ? 84 : 78} r="6" fill={skin} stroke={ink} strokeWidth="2" />
          {face(50, 34, 26)}
          {t.accessory.place === "body" ? accessory(50, 84, 36) : null}
          {t.accessory.place === "hand" ? accessory(armUp ? 76 : 86, armUp ? 22 : 90, 26) : null}
          {t.accessory.place === "head" ? accessory(50, 6, 24) : null}
          {t.accessory.place === "front" ? accessory(50, 122, 34) : null}
        </g>
      );
    }
  }

  return (
    <svg viewBox="0 0 100 140" className={className} role="img" aria-label={title ?? t.label.en} overflow="visible">
      <title>{title ?? t.label.en}</title>
      {body}
    </svg>
  );
}

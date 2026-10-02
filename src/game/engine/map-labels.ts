export type MapLabel = { id: string; x: number; y: number; width: number; height?: number };
export type MapLabelPosition = { x: number; y: number };
const TOUCH = 64;
const ROW_GAP = 8;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const labelHeight = (label: MapLabel) => Math.max(TOUCH, label.height ?? TOUCH);

function gridRows(labels: readonly MapLabel[]) {
  const columns = Math.min(3, labels.length);
  const heights = Array.from({ length: Math.ceil(labels.length / columns) }, (_, row) => Math.max(...labels.slice(row * columns, (row + 1) * columns).map(labelHeight)));
  return { columns, heights };
}

/** Enough room for every measured name and star badge, even on the narrowest map.
 * Each row grows only to its own tallest label, rather than enlarging all names.
 */
export function mapLabelsMinHeight(labels: readonly MapLabel[]): number {
  if (!labels.length) return 0;
  const { heights } = gridRows(labels);
  return heights.reduce((sum, height) => sum + height, 0) + ROW_GAP * (heights.length - 1);
}

/** Labels may move a little on a small painting; authored route coordinates never change.
 * Reserve the whole measured touch rectangle, including invisible padding.
 * The caller gives the map at least mapLabelsMinHeight(labels) before fitting it.
 */
export function fitMapLabels(labels: readonly MapLabel[], width: number, height: number): Record<string, MapLabelPosition> {
  if (!width || !height) return {};
  const placed: Array<{ label: MapLabel; x: number; y: number }> = [];
  for (const label of labels) {
    const half = Math.max(TOUCH, label.width) / 2, halfHeight = labelHeight(label) / 2;
    const origin = { x: clamp(label.x * width, half, width - half), y: clamp(label.y * height, halfHeight, height - halfHeight) };
    const fits = (p: { x: number; y: number }) => placed.every(other => Math.abs(p.x - other.x) >= (Math.max(TOUCH, label.width) + Math.max(TOUCH, other.label.width)) / 2 || Math.abs(p.y - other.y) >= (labelHeight(label) + labelHeight(other.label)) / 2);
    if (fits(origin)) { placed.push({ label, ...origin }); continue; }
    const candidates = [origin];
    for (let y = halfHeight; y <= height - halfHeight; y += 8) {
      for (let x = half; x <= width - half; x += 8) candidates.push({ x, y });
    }
    candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
    const position = candidates.find(fits);
    if (!position) {
      // The caller's minimum height holds three rows, including wrapped names.
      // Fall back as a group instead of letting a later button swallow an earlier one.
      const { columns, heights } = gridRows(labels);
      const extra = Math.max(0, height - mapLabelsMinHeight(labels)) / heights.length;
      const starts = heights.map((_, row) => heights.slice(0, row).reduce((sum, h) => sum + h + ROW_GAP + extra, 0));
      return Object.fromEntries(labels.map((item, i) => {
        const row = Math.floor(i / columns);
        return [item.id, { x: (i % columns + 0.5) / columns, y: (starts[row]! + heights[row]! / 2 + extra / 2) / height }];
      }));
    }
    placed.push({ label, ...position });
  }
  return Object.fromEntries(placed.map(p => [p.label.id, { x: p.x / width, y: p.y / height }]));
}

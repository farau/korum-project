type Props = { name: string; series?: Array<number | null> };

// Preserve each slot's horizontal position, including missing early history.
export default function PriceSparkline({ name, series }: Props) {
  const values = (series ?? []).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return <span className="muted" aria-label={`${name}: no price history in the last 24 hours`}>—</span>;
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const [index, value] of (series ?? []).entries()) {
    if (value === null || !Number.isFinite(value)) {
      current = [];
      continue;
    }
    if (!current.length) segments.push(current);
    current.push({ x: 2 + (index + 1) * 80 / series!.length, y: range ? 25 - (value - min) / range * 22 : 14 });
  }
  const label = `${name} price over the last 24 hours, sampled every 15 minutes; gaps indicate unavailable history`;
  return <svg className={`table-spark ${values.at(-1)! >= values[0] ? "buy" : "sell"}`}
    viewBox="0 0 84 28" role="img" aria-label={label}>
    <title>{label}</title>
    {segments.map((points, index) => points.length === 1
      ? <circle key={index} cx={points[0].x} cy={points[0].y} r="1.4" fill="currentColor" />
      : <polyline key={index} fill="none" stroke="currentColor" strokeWidth="1.4"
          points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />)}
  </svg>;
}

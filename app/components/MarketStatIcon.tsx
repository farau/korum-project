import DesignIcon from "./DesignIcon";
import MetricGlyph from "./analytics/MetricGlyph";

export default function MarketStatIcon({ kind }: { kind: "market" | "people" | "volume" }) {
  if (kind === "people") return <DesignIcon name="user" />;
  if (kind === "volume") return <span aria-hidden="true"><MetricGlyph type="bars" /></span>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" /></svg>;
}

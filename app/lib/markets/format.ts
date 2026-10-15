export function formatCardMarketCap(value: number | null | undefined, currency: "USD" | "ETH" = "USD") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value).replace("K", "k");
  return currency === "USD" ? `$${formatted}` : `${formatted} ETH`;
}

export function formatMarketValue(
  value: number | null | undefined,
  currency: "USD" | "ETH" = "USD",
  maximumFractionDigits = 2,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits,
  }).format(value);
  return currency === "USD" ? `$${formatted}` : `${formatted} ETH`;
}

export function formatTokenPrice(
  value: number | null | undefined,
  currency: "USD" | "ETH" = "USD",
) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 6,
    maximumFractionDigits: value > 0 && value < 0.000001 ? 12 : 8,
  }).format(value);
  return currency === "USD" ? `$${formatted}` : `${formatted} ETH`;
}

export function formatTokenAmount(
  value: string | null | undefined,
  maximumFractionDigits = 4,
) {
  if (value === null || value === undefined) return "—";

  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return "—";

  const [, sign, rawInteger, rawFraction = ""] = match;
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = rawFraction.slice(0, maximumFractionDigits).replace(/0+$/, "");

  return `${sign}${groupedInteger}${fraction ? `.${fraction}` : ""}`;
}

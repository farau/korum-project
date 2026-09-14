const Q192 = BigInt(2) ** BigInt(192);
const WAD = BigInt(10) ** BigInt(18);

function positiveBigInt(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > BigInt(0) ? parsed : null;
}

export function tokenPriceWad(sqrtPriceX96: string | null | undefined) {
  const sqrtPrice = positiveBigInt(sqrtPriceX96);
  if (!sqrtPrice) return null;
  return (Q192 * WAD) / (sqrtPrice * sqrtPrice);
}

export function marketValueWei(
  sqrtPriceX96: string | null | undefined,
  supplyBaseUnits: string | null | undefined,
) {
  const priceWad = tokenPriceWad(sqrtPriceX96);
  const supply = positiveBigInt(supplyBaseUnits);
  if (priceWad === null || supply === null) return null;
  return (priceWad * supply) / WAD;
}

export function unitsNumber(value: string | bigint | null | undefined, decimals = 18) {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "bigint" ? value : /^\d+$/.test(value) ? BigInt(value) : null;
  if (raw === null) return null;
  const divisor = 10 ** decimals;
  const numeric = Number(raw) / divisor;
  return Number.isFinite(numeric) ? numeric : null;
}

export function percentageChange(values: number[]) {
  if (values.length < 2 || values[0] === 0) return 0;
  return ((values.at(-1)! - values[0]) / values[0]) * 100;
}

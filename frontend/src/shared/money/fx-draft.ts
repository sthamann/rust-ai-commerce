/** Draft-only FX preview matches the server rational/half-up boundary; checkout always uses its server quote. */
import type { CurrencyDefinition } from "../api/shop-api";
export function convertDraftPrice(
  value: number,
  source: CurrencyDefinition,
  target: CurrencyDefinition,
): number {
  const units = (text: string) => {
    if (!/^\d+(\.\d{1,8})?$/.test(text)) throw new Error("Invalid saved rate");
    const [whole, fraction = ""] = text.split(".");
    return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
  };
  const sourceMinor = Math.round(value * 10 ** source.scale);
  if (!Number.isSafeInteger(sourceMinor) || sourceMinor < 0)
    throw new Error("Invalid source amount");
  const numerator =
    BigInt(sourceMinor) * units(target.rate) * 10n ** BigInt(target.scale);
  const denominator = units(source.rate) * 10n ** BigInt(source.scale);
  if (denominator <= 0n) throw new Error("Invalid saved rate");
  const result = (numerator + denominator / 2n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("FX amount too large");
  return Number(result) / 10 ** target.scale;
}

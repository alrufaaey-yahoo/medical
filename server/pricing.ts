import {
  ConsultationPrices,
  consultationFeeFor,
  resolveConsultationPrices,
  type ConsultationType,
} from "../shared/billing";

export const MAX_PRICE = 100_000_000;

export type PriceUpdate = { code: string; price: number };

export type PriceChangeRecord = {
  entity: "lab_test" | "consultation";
  reference: string;
  oldPrice: number;
  newPrice: number;
};

export function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_PRICE;
}

export function normalizePrice(value: unknown): number | null {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return isValidPrice(parsed) ? parsed : null;
  }
  return isValidPrice(value) ? value : null;
}

/** Returns only the catalog prices that actually changed. */
export function diffCatalogPrices(
  current: ReadonlyMap<string, number>,
  next: readonly PriceUpdate[],
): PriceChangeRecord[] {
  const changes: PriceChangeRecord[] = [];
  const seen = new Set<string>();
  for (const item of next) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    const oldPrice = current.get(item.code);
    if (oldPrice === undefined || oldPrice === item.price) continue;
    changes.push({ entity: "lab_test", reference: item.code, oldPrice, newPrice: item.price });
  }
  return changes;
}

export function diffConsultationPrices(
  current: ConsultationPrices,
  next: ConsultationPrices,
): PriceChangeRecord[] {
  const changes: PriceChangeRecord[] = [];
  if (current.general !== next.general) {
    changes.push({ entity: "consultation", reference: "general", oldPrice: current.general, newPrice: next.general });
  }
  if (current.specialist !== next.specialist) {
    changes.push({ entity: "consultation", reference: "specialist", oldPrice: current.specialist, newPrice: next.specialist });
  }
  return changes;
}

export function resolvePrices(settings?: {
  consultationGeneralPrice?: number | null;
  consultationSpecialistPrice?: number | null;
} | null): ConsultationPrices {
  return resolveConsultationPrices(settings ?? null);
}

export function feeFor(type: ConsultationType, prices: ConsultationPrices): number {
  return consultationFeeFor(type, prices);
}

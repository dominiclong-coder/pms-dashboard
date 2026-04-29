// Analytics utilities for claims data processing

import { Registration } from "./cache";
import { CohortDataPoint, PurchaseVolume } from "./types";

export interface ChartDataPoint {
  period: string; // "2024-01" for monthly, "2024-W01" for weekly
  periodLabel: string; // "Jan 2024" or "Week 1, 2024"
  claimCount: number;
  totalExposureDays: number;
  claimsPercentage: number; // (claimCount / totalExposureDays) * 100
}

export interface FilterValues {
  productNames: string[];
  skus: string[];
  reasons: string[];
  subReasons: string[];
  purchaseChannels: string[];
  lots: string[];
}

export interface Filters {
  productNames?: string[];
  skus?: string[];
  reasons?: string[];
  subReasons?: string[];
  purchaseChannels?: string[];
  lots?: string[];
}

/** Extract and normalise the lot number a customer entered (first serial number). */
export function getLotFromRegistration(reg: Registration): string | null {
  const raw = reg.serialNumbers?.[0]?.trim();
  if (!raw) return null;
  const sn = raw.toUpperCase();

  // Pre-lot-tracking era — ignore entirely
  if (/^202[234]/.test(sn)) return null;

  // Explicit aliases for known entry variants
  if (sn === "202504") return "202504-DPP";

  return sn;
}

// Calculate days between two dates
export function calculateExposureDays(purchaseDate: string, claimDate: string): number {
  const purchase = new Date(purchaseDate);
  const claim = new Date(claimDate);
  const diffTime = claim.getTime() - purchase.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays); // Ensure non-negative
}

// Get week number from date
function getWeekNumber(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

// Get the first day of a week (Monday) from year and week number
function getFirstDayOfWeek(year: number, week: number): Date {
  const jan1 = new Date(year, 0, 1);
  const daysOffset = (week - 1) * 7;
  const firstDay = new Date(jan1.getTime() + daysOffset * 24 * 60 * 60 * 1000);

  // Find the Monday of this week (0 = Sunday, need to go back to Monday)
  const dayOfWeek = firstDay.getDay();
  const monday = new Date(firstDay);
  if (dayOfWeek === 0) {
    // Sunday - go back 6 days
    monday.setDate(monday.getDate() - 6);
  } else if (dayOfWeek !== 1) {
    // Not Monday - go back to previous Monday
    monday.setDate(monday.getDate() - (dayOfWeek - 1));
  }

  return monday;
}

// Format period key based on granularity
function getPeriodKey(date: Date, period: "weekly" | "monthly"): string {
  if (period === "monthly") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  } else {
    const { year, week } = getWeekNumber(date);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
}

// Format period label for display
function getPeriodLabel(periodKey: string, period: "weekly" | "monthly"): string {
  if (period === "monthly") {
    const [year, month] = periodKey.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  } else {
    const [year, weekStr] = periodKey.split("-W");
    return `W${weekStr} ${year}`;
  }
}

// Extract unique filter values from registrations
export function extractFilterValues(registrations: Registration[]): FilterValues {
  const productNames = new Set<string>();
  const skus = new Set<string>();
  const reasons = new Set<string>();
  const subReasons = new Set<string>();
  const purchaseChannels = new Set<string>();
  const lots = new Set<string>();

  for (const reg of registrations) {
    const pn = getProductName(reg);
    if (pn) productNames.add(pn);
    if (reg.productSku) skus.add(reg.productSku);
    if (reg.fieldData) {
      const reason = reg.fieldData["reason-for-claim"] as string;
      const subReason = reg.fieldData["reason-for-claim57"] as string;
      const channel = reg.fieldData["where-did-you-purchase-this-product-from-"] as string;

      if (reason) reasons.add(reason);
      if (subReason) subReasons.add(subReason);
      if (channel) purchaseChannels.add(channel);
    }
    const lot = getLotFromRegistration(reg);
    if (lot) lots.add(lot);
  }

  return {
    productNames: Array.from(productNames).sort(),
    skus: Array.from(skus).sort(),
    reasons: Array.from(reasons).sort(),
    subReasons: Array.from(subReasons).sort(),
    purchaseChannels: Array.from(purchaseChannels).sort(),
    lots: Array.from(lots).sort(),
  };
}

// Apply filters to registrations
export function applyFilters(registrations: Registration[], filters: Filters): Registration[] {
  return registrations.filter((reg) => {
    // Product Name filter
    if (filters.productNames && filters.productNames.length > 0) {
      const pn = getProductName(reg);
      if (!pn || !filters.productNames.includes(pn)) {
        return false;
      }
    }

    // SKU filter
    if (filters.skus && filters.skus.length > 0) {
      if (!reg.productSku || !filters.skus.includes(reg.productSku)) {
        return false;
      }
    }

    // Reason filter
    if (filters.reasons && filters.reasons.length > 0) {
      const reason = reg.fieldData?.["reason-for-claim"] as string;
      if (!reason || !filters.reasons.includes(reason)) {
        return false;
      }
    }

    // Sub-reason filter
    if (filters.subReasons && filters.subReasons.length > 0) {
      const subReason = reg.fieldData?.["reason-for-claim57"] as string;
      if (!subReason || !filters.subReasons.includes(subReason)) {
        return false;
      }
    }

    // Purchase Channel filter
    if (filters.purchaseChannels && filters.purchaseChannels.length > 0) {
      const channel = reg.fieldData?.["where-did-you-purchase-this-product-from-"] as string;
      if (!channel || !filters.purchaseChannels.includes(channel)) {
        return false;
      }
    }

    // Lot filter (from serialNumbers[0])
    if (filters.lots && filters.lots.length > 0) {
      const lot = getLotFromRegistration(reg);
      if (!lot || !filters.lots.includes(lot)) {
        return false;
      }
    }

    return true;
  });
}

// Exposure day limits by claim type
const EXPOSURE_LIMITS = {
  warranty: { min: 0, max: 365 },
  return: { min: 0, max: 31 },
};

// Check if exposure days is valid for the claim type
export function isValidExposure(exposureDays: number, claimType: "warranty" | "return"): boolean {
  const limits = EXPOSURE_LIMITS[claimType];
  return exposureDays >= limits.min && exposureDays <= limits.max;
}

// Filter registrations by valid exposure days
export function filterByValidExposure(
  registrations: Registration[],
  claimType: "warranty" | "return"
): Registration[] {
  return registrations.filter((reg) => {
    // Require shopifyOrderCreatedAt - exclude if not present
    if (!reg.createdAt || !reg.shopifyOrderCreatedAt) return false;
    const exposureDays = calculateExposureDays(reg.shopifyOrderCreatedAt, reg.createdAt);
    return isValidExposure(exposureDays, claimType);
  });
}

// Group registrations by time period and calculate claims percentage
export function calculateClaimsPercentageByPeriod(
  registrations: Registration[],
  period: "weekly" | "monthly",
  claimType: "warranty" | "return" = "warranty"
): ChartDataPoint[] {
  // Group by period
  const periodData: Record<string, { claimCount: number; totalExposureDays: number }> = {};

  for (const reg of registrations) {
    if (!reg.createdAt || !reg.shopifyOrderCreatedAt) continue;

    const exposureDays = calculateExposureDays(reg.shopifyOrderCreatedAt, reg.createdAt);

    // Skip claims with invalid exposure days
    if (!isValidExposure(exposureDays, claimType)) continue;

    const claimDate = new Date(reg.createdAt);
    const periodKey = getPeriodKey(claimDate, period);

    if (!periodData[periodKey]) {
      periodData[periodKey] = { claimCount: 0, totalExposureDays: 0 };
    }

    periodData[periodKey].claimCount += 1;
    periodData[periodKey].totalExposureDays += exposureDays;
  }

  // Convert to array and sort by period
  const result: ChartDataPoint[] = Object.entries(periodData)
    .map(([periodKey, data]) => ({
      period: periodKey,
      periodLabel: getExtendedPeriodLabel(periodKey, period === "weekly" ? "weekly" : "monthly"),
      claimCount: data.claimCount,
      totalExposureDays: data.totalExposureDays,
      claimsPercentage: data.totalExposureDays > 0
        ? (data.claimCount / data.totalExposureDays) * 100
        : 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  return result;
}

// Time period types for claims over time chart
export type TimePeriod = "daily" | "weekly" | "monthly" | "yearly";

// Grouping options for stacked bar chart
export type GroupBy = "none" | "productName" | "sku" | "reason" | "purchaseChannel" | "serialNumber";

export interface StackedChartDataPoint {
  period: string;
  periodLabel: string;
  total: number;
  otherBreakdown?: Record<string, number>; // Breakdown of "Other" category
  [key: string]: string | number | Record<string, number> | undefined; // Dynamic keys for each stack category
}

// Format period key based on granularity (extended for daily and yearly)
function getExtendedPeriodKey(date: Date, period: TimePeriod): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  switch (period) {
    case "daily":
      return `${year}-${month}-${day}`;
    case "weekly":
      const { year: weekYear, week } = getWeekNumber(date);
      return `${weekYear}-W${String(week).padStart(2, "0")}`;
    case "monthly":
      return `${year}-${month}`;
    case "yearly":
      return `${year}`;
  }
}

// Format period label for display (extended)
function getExtendedPeriodLabel(periodKey: string, period: TimePeriod): string {
  switch (period) {
    case "daily": {
      const [year, month, day] = periodKey.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
    }
    case "weekly": {
      const [year, weekStr] = periodKey.split("-W");
      const week = parseInt(weekStr);
      const firstDay = getFirstDayOfWeek(parseInt(year), week);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[firstDay.getMonth()]} ${firstDay.getDate()}, ${firstDay.getFullYear()}`;
    }
    case "monthly": {
      const [year, month] = periodKey.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    }
    case "yearly":
      return periodKey;
  }
}

// Get the grouping value from a registration
function getGroupValue(reg: Registration, groupBy: GroupBy): string {
  switch (groupBy) {
    case "productName":
      return getProductName(reg) || "Unknown Product";
    case "sku":
      return reg.productSku || "Unknown SKU";
    case "reason":
      return (reg.fieldData?.["reason-for-claim"] as string) || "Unknown Reason";
    case "purchaseChannel":
      return (reg.fieldData?.["where-did-you-purchase-this-product-from-"] as string) || "Unknown Channel";
    case "serialNumber":
      return reg.serialNumbers?.[0]?.trim() || "Unknown Serial";
    default:
      return "All Claims";
  }
}

// Calculate claims count grouped by time period and optional category
export function calculateClaimsOverTime(
  registrations: Registration[],
  period: TimePeriod,
  groupBy: GroupBy = "none",
  claimType: "warranty" | "return" = "warranty"
): { data: StackedChartDataPoint[]; categories: string[] } {
  // Track all unique categories
  const allCategories = new Set<string>();

  // Group by period
  const periodData: Record<string, Record<string, number>> = {};

  for (const reg of registrations) {
    if (!reg.createdAt) continue;

    const claimDate = new Date(reg.createdAt);
    const periodKey = getExtendedPeriodKey(claimDate, period);
    const category = getGroupValue(reg, groupBy);

    allCategories.add(category);

    if (!periodData[periodKey]) {
      periodData[periodKey] = {};
    }

    periodData[periodKey][category] = (periodData[periodKey][category] || 0) + 1;
  }

  // Sort categories by total count (descending) and limit to top 10 + "Other"
  const categoryCounts: Record<string, number> = {};
  for (const periodCounts of Object.values(periodData)) {
    for (const [category, count] of Object.entries(periodCounts)) {
      categoryCounts[category] = (categoryCounts[category] || 0) + count;
    }
  }

  const sortedCategories = Array.from(allCategories)
    .sort((a, b) => (categoryCounts[b] || 0) - (categoryCounts[a] || 0));

  // Limit to top 15 categories, consolidate rest into "Other"
  const topCategories = groupBy === "none"
    ? sortedCategories
    : sortedCategories.slice(0, 15);
  const otherCategories = groupBy === "none"
    ? []
    : sortedCategories.slice(15);

  // Convert to array format for chart
  const result: StackedChartDataPoint[] = Object.entries(periodData)
    .map(([periodKey, counts]) => {
      const dataPoint: StackedChartDataPoint = {
        period: periodKey,
        periodLabel: getExtendedPeriodLabel(periodKey, period),
        total: 0,
      };

      // Add top categories
      for (const category of topCategories) {
        dataPoint[category] = counts[category] || 0;
        dataPoint.total += counts[category] || 0;
      }

      // Combine remaining into "Other" if needed
      if (otherCategories.length > 0) {
        let otherCount = 0;
        const breakdown: Record<string, number> = {};
        for (const category of otherCategories) {
          const count = counts[category] || 0;
          otherCount += count;
          if (count > 0) {
            breakdown[category] = count;
          }
        }
        if (otherCount > 0) {
          dataPoint["Other"] = otherCount;
          dataPoint.total += otherCount;
          dataPoint.otherBreakdown = breakdown;
        }
      }

      return dataPoint;
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  // Final categories list (top categories + "Other" if needed)
  const finalCategories = [...topCategories];
  if (otherCategories.length > 0) {
    finalCategories.push("Other");
  }

  return { data: result, categories: finalCategories };
}

// Combine filter values from multiple form types
export function combineFilterValues(filterValuesArray: FilterValues[]): FilterValues {
  const combined: FilterValues = {
    productNames: [],
    skus: [],
    reasons: [],
    subReasons: [],
    purchaseChannels: [],
    lots: [],
  };

  for (const fv of filterValuesArray) {
    combined.productNames = [...new Set([...combined.productNames, ...fv.productNames])].sort();
    combined.skus = [...new Set([...combined.skus, ...fv.skus])].sort();
    combined.reasons = [...new Set([...combined.reasons, ...fv.reasons])].sort();
    combined.subReasons = [...new Set([...combined.subReasons, ...fv.subReasons])].sort();
    combined.purchaseChannels = [...new Set([...combined.purchaseChannels, ...fv.purchaseChannels])].sort();
    combined.lots = [...new Set([...combined.lots, ...fv.lots])].sort();
  }

  return combined;
}

/**
 * Returns the product name for a registration, falling back to
 * fieldData["product-name"] for forms submitted from 5 March 2026 onwards
 * (where the top-level productName field is no longer populated).
 */
export function getProductName(reg: Registration): string | undefined {
  const topLevel = reg.productName?.trim();
  if (topLevel) return topLevel;
  const fromField = (reg.fieldData?.["product-name"] as string | undefined)?.trim();
  return fromField || undefined;
}

// Extract product type from full product name for cohort analysis
export function extractProductType(productName: string | undefined): string {
  if (!productName) return "Other";

  // Test patterns in order of specificity (most specific first)
  // This handles variants like colors, "Copy", "LP Test", etc.

  if (/Dental Pod Go/i.test(productName)) {
    return "Dental Pod Go";
  }

  if (/Dental Pod Pro/i.test(productName)) {
    return "Dental Pod Pro";
  }

  // Match "Dental Pod" but NOT "Dental Pod Go" or "Dental Pod Pro"
  if (/Dental Pod(?!\s+(Go|Pro))/i.test(productName)) {
    return "Dental Pod";
  }

  // Match Zima Case Air separately (must come before the Zima Go/UV Case check)
  if (/Zima Case Air/i.test(productName)) {
    return "Zima Case Air";
  }

  // Match Zima Go and Zima UV Case
  if (/Zima (Go|UV Case)/i.test(productName)) {
    return "Zima Go/Zima UV Case";
  }

  return "Other";
}

// Lot number → canonical product type mapping
// Used as a fallback when the product name field is blank or unrecognisable
const LOT_TO_PRODUCT: Record<string, string> = {
  "202201":     "Dental Pod",
  "202204":     "Dental Pod",
  "202206":     "Dental Pod",
  "202209":     "Dental Pod",
  "202211":     "Dental Pod",
  "202302":     "Dental Pod",
  "202305":     "Dental Pod",
  "202305-N":   "Dental Pod",
  "202308":     "Dental Pod",
  "202311":     "Dental Pod",
  "202401":     "Dental Pod",
  "202405":     "Dental Pod",
  "202409":     "Dental Pod",
  "202412":     "Dental Pod",
  "202501":     "Dental Pod",
  "202503-DP":  "Dental Pod",
  "202508-DP1": "Dental Pod",
  "202509-DP":  "Dental Pod",
  "202510-DP1": "Dental Pod",
  "202511-DP":  "Dental Pod",
  "202601-DP2": "Dental Pod",
  "202410":     "Dental Pod Pro",
  "202504-DPP": "Dental Pod Pro",
  "202509-DPP": "Dental Pod Pro",
  "202511-DPP": "Dental Pod Pro",
  "202601-DPP": "Dental Pod Pro",
  "202503-ZG":  "Zima Go/Zima UV Case",
  "202509-ZG":  "Zima Go/Zima UV Case",
  "202511-ZG":  "Zima Go/Zima UV Case",
  "202510-ZCA": "Zima Case Air",
  "202509-TP":  "Dental Pod Go",
};

// Sort lot keys longest-first so prefix matching picks the most specific lot
const LOT_KEYS_BY_LENGTH = Object.keys(LOT_TO_PRODUCT).sort((a, b) => b.length - a.length);

function getProductFromSerialNumber(serialNumber: string): string {
  const sn = serialNumber.toUpperCase().trim();
  for (const lot of LOT_KEYS_BY_LENGTH) {
    if (sn === lot || sn.startsWith(lot + "-") || sn.startsWith(lot + " ")) {
      return LOT_TO_PRODUCT[lot]!;
    }
  }
  return "";
}

/**
 * Returns the canonical product type for a registration.
 * Tries the serial number lot lookup first (more reliable — physically on the device);
 * falls back to the product name field if no serial number is present or unrecognised.
 */
export function getProductType(reg: Registration): string {
  const sn = reg.serialNumbers?.[0]?.trim();
  if (sn) {
    const fromSerial = getProductFromSerialNumber(sn);
    if (fromSerial) return fromSerial;
  }

  return extractProductType(getProductName(reg));
}

// Calculate months between two dates using DATEDIF logic (complete months elapsed)
function calculateMonthsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  let months = (end.getFullYear() - start.getFullYear()) * 12;
  months += end.getMonth() - start.getMonth();

  // Only count if the day has passed in the end month
  if (end.getDate() < start.getDate()) {
    months--;
  }

  return Math.max(0, months);
}

// Calculate cohort survival analysis data
export function calculateCohortSurvival(
  registrations: Registration[],
  purchaseVolumes: PurchaseVolume[],
  productFilter: string,
  startMonth: string,      // "2024-01"
  endMonth: string,        // "2024-12"
  claimType: "warranty" | "return",
  lotFilter?: string[]     // e.g. ["202503-DP", "202504-DP"] — filters both claims and purchase volumes
): CohortDataPoint[] {
  // 1. Filter registrations by valid exposure, product, and optional lot
  const validRegistrations = registrations.filter((reg) => {
    // Require shopifyOrderCreatedAt - exclude if not present
    if (!reg.shopifyOrderCreatedAt || !reg.createdAt) return false;

    // Check exposure days validity
    const exposureDays = calculateExposureDays(reg.shopifyOrderCreatedAt, reg.createdAt);
    if (!isValidExposure(exposureDays, claimType)) return false;

    // Filter by purchase channel - only include Shopify store purchases for warranty claims
    if (claimType === "warranty") {
      const purchaseChannel = reg.fieldData?.["where-did-you-purchase-this-product-from-"] as string | undefined;
      const validChannels = ["Shop App", "Zima Dental Website", "Zima Dental Website or Shop App"];
      if (!purchaseChannel || !validChannels.includes(purchaseChannel)) {
        return false;
      }
    }

    // Filter by product (name first, serial number fallback)
    const productType = getProductType(reg);

    if (productFilter === "All Products") {
      // Only include claims from products we're tracking
      const trackedProducts = [
        "Dental Pod",
        "Dental Pod Go",
        "Dental Pod Pro",
        "Zima Go/Zima UV Case",
      ];
      if (!trackedProducts.includes(productType)) return false;
    } else {
      // Filter for specific product
      if (productType !== productFilter) return false;
    }

    // Filter by lot (from serialNumbers[0]) if specified
    if (lotFilter && lotFilter.length > 0) {
      const regLot = getLotFromRegistration(reg);
      const lotKey = regLot ?? "Unknown";
      if (!lotFilter.includes(lotKey)) return false;
    }

    return true;
  });

  // 2. Group registrations by purchase month cohort
  const cohortClaims: Record<string, Record<number, number>> = {};

  for (const reg of validRegistrations) {
    if (!reg.shopifyOrderCreatedAt || !reg.createdAt) continue;

    const cohortMonth = getPeriodKey(new Date(reg.shopifyOrderCreatedAt), "monthly");

    // Only include cohorts within date range
    if (cohortMonth < startMonth || cohortMonth > endMonth) continue;

    // Calculate months since purchase
    const monthsSince = calculateMonthsBetween(reg.shopifyOrderCreatedAt, reg.createdAt);

    // Initialize cohort if needed
    if (!cohortClaims[cohortMonth]) {
      cohortClaims[cohortMonth] = {};
    }

    // Increment claim count for this month and all subsequent months (cumulative)
    const maxMonths = claimType === "warranty" ? 12 : 1;
    for (let m = monthsSince; m <= maxMonths; m++) {
      cohortClaims[cohortMonth][m] = (cohortClaims[cohortMonth][m] || 0) + 1;
    }
  }

  // 3. Build cohort data points with purchase volumes
  const dataPoints: CohortDataPoint[] = [];
  const maxMonths = claimType === "warranty" ? 12 : 1;

  // Create purchase volume lookup map (aggregated by yearMonth|product).
  // When lotFilter is active, only sum volumes for that specific lot.
  // Normalise legacy Firebase key "Zima Go/Zima UV Case/Zima Case Air" → "Zima Go/Zima UV Case"
  // so existing data continues to work without a re-import.
  const volumeMap = new Map<string, number>();
  for (const pv of purchaseVolumes) {
    if (lotFilter && lotFilter.length > 0 && !lotFilter.includes(pv.lot ? pv.lot.toUpperCase() : "Unknown")) continue;
    const product = pv.product === "Zima Go/Zima UV Case/Zima Case Air"
      ? "Zima Go/Zima UV Case"
      : pv.product;
    const key = `${pv.yearMonth}|${product}`;
    volumeMap.set(key, (volumeMap.get(key) ?? 0) + pv.purchaseCount);
  }

  // Generate all months in the From–To range so rows are always stable
  const allRangeMonths: string[] = [];
  if (startMonth && endMonth) {
    const [sy, sm] = startMonth.split("-").map(Number);
    const [ey, em] = endMonth.split("-").map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      allRangeMonths.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }

  // Use range months if available, otherwise fall back to months with claims
  const cohortMonths = allRangeMonths.length > 0
    ? allRangeMonths
    : Object.keys(cohortClaims).sort();

  // Calculate the most recent complete month
  const now = new Date();
  const lastCompleteMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastCompleteMonthKey = getPeriodKey(lastCompleteMonth, "monthly");

  for (const cohortMonth of cohortMonths) {
    // Get purchase volume for this cohort
    let purchaseVolume = 0;

    if (productFilter === "All Products") {
      // Sum all products for this month
      const allProducts = [
        "Dental Pod",
        "Dental Pod Go",
        "Dental Pod Pro",
        "Zima Go/Zima UV Case",
      ];

      for (const product of allProducts) {
        const volumeKey = `${cohortMonth}|${product}`;
        purchaseVolume += volumeMap.get(volumeKey) || 0;
      }
    } else {
      // Get specific product volume
      const volumeKey = `${cohortMonth}|${productFilter}`;
      purchaseVolume = volumeMap.get(volumeKey) || 0;
    }

    for (let monthsSince = 0; monthsSince <= maxMonths; monthsSince++) {
      // Calculate what month this data point represents
      const cohortDate = new Date(cohortMonth + "-01");
      const dataPointDate = new Date(cohortDate);
      dataPointDate.setMonth(dataPointDate.getMonth() + monthsSince);
      const dataPointMonthKey = getPeriodKey(dataPointDate, "monthly");

      // Only show data if we have a complete month of data
      // (the data point month must be <= last complete month)
      if (dataPointMonthKey > lastCompleteMonthKey) {
        continue; // Skip this data point
      }

      const claimCount = (cohortClaims[cohortMonth] ?? {})[monthsSince] || 0;

      const claimRate = purchaseVolume > 0 ? (claimCount / purchaseVolume) * 100 : 0;
      const survivalRate = 100 - claimRate;

      dataPoints.push({
        cohortMonth,
        cohortLabel: getPeriodLabel(cohortMonth, "monthly"),
        monthsSincePurchase: monthsSince,
        claimCount,
        purchaseVolume,
        survivalRate,
        claimRate,
      });
    }
  }

  return dataPoints;
}

// ─── Daily Launch Tracker ─────────────────────────────────────────────────────

export interface LaunchSeries {
  id: string;
  label: string;
  product: string;       // e.g. "Dental Pod" or "All Products"
  lots: string[];        // [] means all lots
  startDate: string;     // "YYYY-MM-DD"
  color: string;
}

export interface DailyDataPoint {
  day: number;
  claimsCount: number;
  cohortSize: number;
  claimRate: number;     // percentage 0-100
}

/** Number of days in a month given a "YYYY-MM" yearMonth string. */
function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

/** Tracked products used when filtering "All Products". */
const TRACKED_PRODUCTS = [
  "Dental Pod",
  "Dental Pod Go",
  "Dental Pod Pro",
  "Zima Go/Zima UV Case",
];

/** Valid purchase channels for warranty claims. */
const VALID_WARRANTY_CHANNELS = ["Shop App", "Zima Dental Website", "Zima Dental Website or Shop App"];

/**
 * Calculates daily cumulative claim rate from a launch start date.
 * For each day 0–maxDays:
 *   - claimsCount = registrations filed within `day` days of shopify order
 *   - cohortSize  = purchases from startDate up to (today - day days), prorated
 *   - claimRate   = claimsCount / cohortSize * 100
 */
export function calculateDailyLaunchSurvival(
  registrations: Registration[],
  purchaseVolumes: PurchaseVolume[],
  series: LaunchSeries,
  maxDays: number,
  claimType: "warranty" | "return",
  today?: Date
): DailyDataPoint[] {
  const now = today ?? new Date();
  const nowStr = now.toISOString().split("T")[0];

  // Filter registrations
  const filtered = registrations.filter((reg) => {
    if (!reg.shopifyOrderCreatedAt || !reg.createdAt) return false;

    // Valid exposure check
    const exposureDays = Math.floor(
      (new Date(reg.createdAt).getTime() - new Date(reg.shopifyOrderCreatedAt).getTime()) / 86400000
    );
    if (!isValidExposure(exposureDays, claimType)) return false;

    // Warranty: valid purchase channel only
    if (claimType === "warranty") {
      const channel = reg.fieldData?.["where-did-you-purchase-this-product-from-"] as string | undefined;
      if (!channel || !VALID_WARRANTY_CHANNELS.includes(channel)) return false;
    }

    // Must have been purchased on or after startDate
    const purchaseDateStr = reg.shopifyOrderCreatedAt.split("T")[0];
    if (purchaseDateStr < series.startDate) return false;

    // Product filter
    const productType = getProductType(reg);
    if (series.product === "All Products") {
      if (!TRACKED_PRODUCTS.includes(productType)) return false;
    } else {
      if (productType !== series.product) return false;
    }

    // Lot filter
    if (series.lots.length > 0) {
      const regLot = getLotFromRegistration(reg);
      const lotKey = regLot ?? "Unknown";
      if (!series.lots.includes(lotKey)) return false;
    }

    return true;
  });

  // Filter purchase volumes for this series
  const relevantVolumes = purchaseVolumes.filter((pv) => {
    const product = pv.product === "Zima Go/Zima UV Case/Zima Case Air"
      ? "Zima Go/Zima UV Case"
      : pv.product;

    if (series.product === "All Products") {
      if (!TRACKED_PRODUCTS.includes(product)) return false;
    } else {
      if (product !== series.product) return false;
    }

    if (series.lots.length > 0) {
      const pvLot = pv.lot ? pv.lot.toUpperCase() : "Unknown";
      if (!series.lots.includes(pvLot)) return false;
    }

    return true;
  });

  const startDateMs = new Date(series.startDate).getTime();

  const result: DailyDataPoint[] = [];

  for (let day = 0; day <= maxDays; day++) {
    // Day N = N days after launch startDate.
    // cohortCutoffStr = startDate + N days (capped at today if that date is in the future).
    // This means the denominator grows as N increases: it's all units purchased in the
    // first N days of the launch, and is fully settled once startDate+N is in the past.
    const rawCutoff = new Date(startDateMs + day * 86400000).toISOString().split("T")[0];
    const cohortCutoffStr = rawCutoff < nowStr ? rawCutoff : nowStr;

    // claimsCount: purchases in [startDate, cohortCutoffStr] with a claim date also
    // within [startDate, cohortCutoffStr]. daysBetween <= day is guaranteed since
    // purchase >= startDate and claim <= startDate+N means gap <= N days.
    const claimsCount = filtered.filter((reg) => {
      const purchaseDateStr = reg.shopifyOrderCreatedAt!.split("T")[0];
      if (purchaseDateStr > cohortCutoffStr) return false;
      const claimDateStr = reg.createdAt!.split("T")[0];
      return claimDateStr <= cohortCutoffStr;
    }).length;

    // cohortSize: total purchases from startDate to cohortCutoffStr
    let cohortSizeRaw = 0;
    for (const pv of relevantVolumes) {
      const ymStart = `${pv.yearMonth}-01`;
      const lastDay = daysInMonth(pv.yearMonth);
      const ymEnd = `${pv.yearMonth}-${String(lastDay).padStart(2, "0")}`;

      if (ymEnd < series.startDate || ymStart > cohortCutoffStr) continue;

      if (pv.dailyCounts) {
        for (const [dateStr, count] of Object.entries(pv.dailyCounts)) {
          if (dateStr >= series.startDate && dateStr <= cohortCutoffStr) {
            cohortSizeRaw += count;
          }
        }
      } else {
        const dailyRate = pv.purchaseCount / daysInMonth(pv.yearMonth);
        const rangeStart = series.startDate > ymStart ? series.startDate : ymStart;
        const rangeEnd = cohortCutoffStr < ymEnd ? cohortCutoffStr : ymEnd;
        if (rangeStart <= rangeEnd) {
          const startD = new Date(rangeStart);
          const endD = new Date(rangeEnd);
          const days = Math.floor((endD.getTime() - startD.getTime()) / 86400000) + 1;
          cohortSizeRaw += dailyRate * days;
        }
      }
    }

    const cohortSize = Math.round(cohortSizeRaw);
    const claimRate = cohortSize > 0 ? (claimsCount / cohortSize) * 100 : 0;

    result.push({
      day,
      claimsCount,
      cohortSize,
      claimRate,
    });
  }

  return result;
}

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
  serialNumbers: string[];
  reasons: string[];
  subReasons: string[];
  purchaseChannels: string[];
}

export interface Filters {
  productNames?: string[];
  skus?: string[];
  serialNumbers?: string[];
  reasons?: string[];
  subReasons?: string[];
  purchaseChannels?: string[];
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
  const serialNumbers = new Set<string>();
  const reasons = new Set<string>();
  const subReasons = new Set<string>();
  const purchaseChannels = new Set<string>();

  for (const reg of registrations) {
    if (reg.productName) productNames.add(reg.productName);
    if (reg.productSku) skus.add(reg.productSku);
    if (reg.serialNumbers) {
      for (const sn of reg.serialNumbers) {
        serialNumbers.add(sn);
      }
    }
    if (reg.fieldData) {
      const reason = reg.fieldData["reason-for-claim"] as string;
      const subReason = reg.fieldData["reason-for-claim57"] as string;
      const channel = reg.fieldData["where-did-you-purchase-this-product-from-"] as string;

      if (reason) reasons.add(reason);
      if (subReason) subReasons.add(subReason);
      if (channel) purchaseChannels.add(channel);
    }
  }

  return {
    productNames: Array.from(productNames).sort(),
    skus: Array.from(skus).sort(),
    serialNumbers: Array.from(serialNumbers).sort(),
    reasons: Array.from(reasons).sort(),
    subReasons: Array.from(subReasons).sort(),
    purchaseChannels: Array.from(purchaseChannels).sort(),
  };
}

// Apply filters to registrations
export function applyFilters(registrations: Registration[], filters: Filters): Registration[] {
  return registrations.filter((reg) => {
    // Product Name filter
    if (filters.productNames && filters.productNames.length > 0) {
      if (!reg.productName || !filters.productNames.includes(reg.productName)) {
        return false;
      }
    }

    // SKU filter
    if (filters.skus && filters.skus.length > 0) {
      if (!reg.productSku || !filters.skus.includes(reg.productSku)) {
        return false;
      }
    }

    // Serial Number filter
    if (filters.serialNumbers && filters.serialNumbers.length > 0) {
      if (!reg.serialNumbers || !reg.serialNumbers.some(sn => filters.serialNumbers!.includes(sn))) {
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
      return reg.productName || "Unknown Product";
    case "sku":
      return reg.productSku || "Unknown SKU";
    case "reason":
      return (reg.fieldData?.["reason-for-claim"] as string) || "Unknown Reason";
    case "purchaseChannel":
      return (reg.fieldData?.["where-did-you-purchase-this-product-from-"] as string) || "Unknown Channel";
    case "serialNumber":
      return reg.serialNumbers?.[0] || "Unknown Serial";
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
    serialNumbers: [],
    reasons: [],
    subReasons: [],
    purchaseChannels: [],
  };

  for (const fv of filterValuesArray) {
    combined.productNames = [...new Set([...combined.productNames, ...fv.productNames])].sort();
    combined.skus = [...new Set([...combined.skus, ...fv.skus])].sort();
    combined.serialNumbers = [...new Set([...combined.serialNumbers, ...fv.serialNumbers])].sort();
    combined.reasons = [...new Set([...combined.reasons, ...fv.reasons])].sort();
    combined.subReasons = [...new Set([...combined.subReasons, ...fv.subReasons])].sort();
    combined.purchaseChannels = [...new Set([...combined.purchaseChannels, ...fv.purchaseChannels])].sort();
  }

  return combined;
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

  // Match all Zima variants
  if (/Zima (Go|UV Case|Case Air)/i.test(productName)) {
    return "Zima Go/Zima UV Case/Zima Case Air";
  }

  return "Other";
}

// Calculate months between two dates
function calculateMonthsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const yearDiff = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();

  return yearDiff * 12 + monthDiff;
}

// Calculate cohort survival analysis data
export function calculateCohortSurvival(
  registrations: Registration[],
  purchaseVolumes: PurchaseVolume[],
  productFilter: string,
  startMonth: string,      // "2024-01"
  endMonth: string,        // "2024-12"
  claimType: "warranty" | "return"
): CohortDataPoint[] {
  // 1. Filter registrations by valid exposure and product
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

    // Filter by product
    const productType = extractProductType(reg.productName);

    if (productFilter === "All Products") {
      // Only include claims from products we're tracking
      const trackedProducts = [
        "Dental Pod",
        "Dental Pod Go",
        "Dental Pod Pro",
        "Zima Go/Zima UV Case/Zima Case Air",
      ];
      if (!trackedProducts.includes(productType)) return false;
    } else {
      // Filter for specific product
      if (productType !== productFilter) return false;
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

  // Create purchase volume lookup map
  const volumeMap = new Map<string, number>();
  for (const pv of purchaseVolumes) {
    const key = `${pv.yearMonth}|${pv.product}`;
    volumeMap.set(key, pv.purchaseCount);
  }

  // Generate data points for each cohort and month
  const cohortMonths = Object.keys(cohortClaims).sort();

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
        "Zima Go/Zima UV Case/Zima Case Air",
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

      const claimCount = cohortClaims[cohortMonth][monthsSince] || 0;

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

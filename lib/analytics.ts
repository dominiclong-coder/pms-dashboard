// Analytics utilities for claims data processing

import { Registration } from "./cache";

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
    if (!reg.createdAt || !reg.purchaseDate) return false;
    const exposureDays = calculateExposureDays(reg.purchaseDate, reg.createdAt);
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
    if (!reg.createdAt || !reg.purchaseDate) continue;

    const exposureDays = calculateExposureDays(reg.purchaseDate, reg.createdAt);

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
      periodLabel: getPeriodLabel(periodKey, period),
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
export type GroupBy = "none" | "productName" | "sku" | "reason" | "purchaseChannel";

export interface StackedChartDataPoint {
  period: string;
  periodLabel: string;
  total: number;
  [key: string]: string | number; // Dynamic keys for each stack category
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
      return `W${weekStr} ${year}`;
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

    // Validate exposure days if purchase date exists
    if (reg.purchaseDate) {
      const exposureDays = calculateExposureDays(reg.purchaseDate, reg.createdAt);
      if (!isValidExposure(exposureDays, claimType)) continue;
    }

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

  // If groupBy is "none", keep single category; otherwise limit to top 10
  const topCategories = groupBy === "none"
    ? sortedCategories
    : sortedCategories.slice(0, 10);
  const otherCategories = groupBy === "none"
    ? []
    : sortedCategories.slice(10);

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
        for (const category of otherCategories) {
          otherCount += counts[category] || 0;
        }
        if (otherCount > 0) {
          dataPoint["Other"] = otherCount;
          dataPoint.total += otherCount;
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

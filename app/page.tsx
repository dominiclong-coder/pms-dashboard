"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Filters } from "@/components/Filters";
import { ClaimsChart } from "@/components/ClaimsChart";
import { ClaimsOverTimeWithControls } from "@/components/ClaimsOverTimeChart";
import { CohortChartWithControls } from "@/components/CohortChartWithControls";
import { Tooltip } from "@/components/Tooltip";
import {
  extractFilterValues,
  applyFilters,
  calculateClaimsPercentageByPeriod,
  calculateClaimsOverTime,
  filterByValidExposure,
  Filters as FiltersType,
  ChartDataPoint,
} from "@/lib/analytics";
import {
  Registration,
  StaticData,
  loadStaticData,
  formatLastUpdated,
  fetchNewestRegistrations,
} from "@/lib/client-api";
import { PurchaseVolume, PurchaseVolumeData } from "@/lib/types";
import { loadPurchaseVolumes, savePurchaseVolumes } from "@/lib/firebase";

function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Date range options
type DateRange = "30d" | "90d" | "180d" | "1y" | "all";

// Filter chart data by date range
function filterChartDataByDateRange(
  data: ChartDataPoint[],
  dateRange: DateRange
): ChartDataPoint[] {
  if (dateRange === "all" || data.length === 0) return data;

  const now = new Date();
  let cutoffDate: Date;

  switch (dateRange) {
    case "30d":
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "180d":
      cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      break;
    case "1y":
      cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      return data;
  }

  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  return data.filter((d) => {
    const period = d.period;
    if (period.includes("W")) {
      const [year, weekStr] = period.split("-W");
      const jan1 = new Date(parseInt(year), 0, 1);
      const weekDate = new Date(jan1.getTime() + (parseInt(weekStr) - 1) * 7 * 24 * 60 * 60 * 1000);
      return weekDate >= cutoffDate;
    }
    return period >= cutoffStr.substring(0, period.length);
  });
}

// Claim types
const CLAIM_TYPES = [
  { slug: "warranty-claim", name: "Warranty Claims" },
  { slug: "return-claim", name: "Return Claims" },
];

export default function Dashboard() {
  const [claimType, setClaimType] = useState<"warranty" | "return">("warranty");
  const [period, setPeriod] = useState<"weekly" | "monthly">("monthly");
  const [filters, setFilters] = useState<FiltersType>({});
  const [dateRange, setDateRange] = useState<DateRange>("1y");

  // Data state
  const [registrationsByForm, setRegistrationsByForm] = useState<Record<string, Registration[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ form: string; count: number } | null>(null);
  const [staticDataTimestamp, setStaticDataTimestamp] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [newClaimsCount, setNewClaimsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Track if auto-refresh has run
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false);

  // Purchase volumes for cohort analysis
  const [purchaseVolumes, setPurchaseVolumes] = useState<PurchaseVolume[]>([]);

  // Refresh to fetch newest records
  const handleRefresh = useCallback(async () => {
    if (!staticDataTimestamp || isRefreshing) return;

    setIsRefreshing(true);
    setNewClaimsCount(0);
    setRefreshProgress(null);

    try {
      let totalNewClaims = 0;
      const updatedData = { ...registrationsByForm };

      for (const claimTypeInfo of CLAIM_TYPES) {
        setRefreshProgress({ form: claimTypeInfo.name, count: 0 });

        // Get existing IDs to avoid duplicates
        const existingIds = new Set(
          (registrationsByForm[claimTypeInfo.slug] || []).map((r) => r.id)
        );

        // Fetch only new records since the static data was built
        const newRecords = await fetchNewestRegistrations(
          claimTypeInfo.slug,
          staticDataTimestamp,
          existingIds,
          (count) => {
            setRefreshProgress({ form: claimTypeInfo.name, count });
          }
        );

        if (newRecords.length > 0) {
          // Merge new records with existing data
          updatedData[claimTypeInfo.slug] = [
            ...newRecords,
            ...(registrationsByForm[claimTypeInfo.slug] || []),
          ];
          totalNewClaims += newRecords.length;
        }
      }

      setRegistrationsByForm(updatedData);
      setNewClaimsCount(totalNewClaims);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  }, [staticDataTimestamp, registrationsByForm, isRefreshing]);

  // Load static data and purchase volumes on mount
  useEffect(() => {
    Promise.all([
      loadStaticData(),
      loadPurchaseVolumes(),
    ])
      .then(([data, volumeData]) => {
        setRegistrationsByForm({
          "warranty-claim": data.warrantyRegistrations,
          "return-claim": data.returnRegistrations,
        });
        setStaticDataTimestamp(data.metadata.fetchedAt);
        setLastUpdated(data.metadata.fetchedAt);
        setPurchaseVolumes(volumeData.volumes);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setIsLoading(false);
      });
  }, []);

  // Auto-refresh on first load to fill in missing records (due to API pagination quirk with limit=100)
  useEffect(() => {
    if (!isLoading && staticDataTimestamp && !hasAutoRefreshed && !isRefreshing) {
      setHasAutoRefreshed(true);
      handleRefresh();
    }
  }, [isLoading, staticDataTimestamp, hasAutoRefreshed, isRefreshing, handleRefresh]);

  // Handler for purchase volume updates
  const handlePurchaseVolumesUpdate = useCallback(async (data: PurchaseVolumeData) => {
    await savePurchaseVolumes(data);
    setPurchaseVolumes(data.volumes);
  }, []);

  // Get registrations for selected claim type
  const formSlug = claimType === "warranty" ? "warranty-claim" : "return-claim";
  const allRegistrations = registrationsByForm[formSlug] || [];

  // Filter to only include valid exposure days
  const registrations = useMemo(() => {
    return filterByValidExposure(allRegistrations, claimType);
  }, [allRegistrations, claimType]);

  const totalCount = registrations.length;
  const rawCount = allRegistrations.length;
  const excludedCount = rawCount - totalCount;

  // Calculate filter values
  const filterValues = useMemo(() => {
    return extractFilterValues(registrations);
  }, [registrations]);

  // Apply filters and calculate chart data
  const filteredRegistrations = useMemo(() => {
    return applyFilters(registrations, filters);
  }, [registrations, filters]);

  const chartData = useMemo(() => {
    const rawChartData = calculateClaimsPercentageByPeriod(filteredRegistrations, period, claimType);
    return filterChartDataByDateRange(rawChartData, dateRange);
  }, [filteredRegistrations, period, claimType, dateRange]);

  const hasActiveFilters = Object.values(filters).some((v) => v && v.length > 0);
  const hasData = Object.keys(registrationsByForm).length > 0;

  // Clear filters when switching claim type
  const handleClaimTypeChange = (type: "warranty" | "return") => {
    setClaimType(type);
    setFilters({});
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900 mb-8">Claims Dashboard</h1>
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Loading dashboard data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Failed to load data</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <p className="text-slate-600 text-sm mt-4">
            This may be a temporary issue. Try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  const claimTypeLabel = claimType === "warranty" ? "Warranty Claims" : "Return Claims";
  const chartColor = claimType === "warranty" ? "#3b82f6" : "#10b981";
  const exposureLimit = claimType === "warranty" ? "0-365" : "0-31";
  const periodLabel = claimType === "warranty" ? "warranty period" : "return window";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Claims Dashboard</h1>
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <span className="text-sm text-slate-500">
                Data as of: {formatLastUpdated(lastUpdated)}
                {newClaimsCount > 0 && (
                  <span className="text-green-600 ml-2">
                    (+{newClaimsCount} new)
                  </span>
                )}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {isRefreshing && (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Refresh Progress */}
        {isRefreshing && refreshProgress && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-blue-800">
                Checking for new {refreshProgress.form}...
                {refreshProgress.count > 0 && ` (${refreshProgress.count} found)`}
              </p>
            </div>
          </div>
        )}

        {/* Claim Type Toggle & Stats */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex bg-white border border-slate-200 rounded-lg p-1">
            <button
              onClick={() => handleClaimTypeChange("warranty")}
              className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                claimType === "warranty"
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Warranty Claims
            </button>
            <button
              onClick={() => handleClaimTypeChange("return")}
              className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                claimType === "return"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Return Claims
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 px-6 py-3">
            <span className="text-sm text-slate-500 mr-2">{claimTypeLabel}:</span>
            <span className="text-2xl font-bold" style={{ color: chartColor }}>
              {formatNumber(totalCount)}
            </span>
            {hasActiveFilters && (
              <span className="text-sm text-slate-500 ml-2">
                ({formatNumber(filteredRegistrations.length)} filtered)
              </span>
            )}
            {excludedCount > 0 && (
              <Tooltip
                content={
                  <div>
                    <p className="font-medium mb-1">Why are claims excluded?</p>
                    <p>
                      {formatNumber(excludedCount)} claims have exposure days outside the valid range ({exposureLimit} days).
                    </p>
                    <p className="mt-2 text-slate-500">
                      This typically indicates data quality issues:
                    </p>
                    <ul className="list-disc list-inside mt-1 text-slate-500">
                      <li>Missing purchase dates</li>
                      <li>Future-dated purchases</li>
                      <li>Claims filed long after the {periodLabel}</li>
                    </ul>
                  </div>
                }
              >
                <span className="text-xs text-slate-400 ml-2 border-b border-dotted border-slate-300">
                  ({formatNumber(excludedCount)} excluded
                  <span className="text-slate-300 ml-1">ⓘ</span>)
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Filters */}
        {hasData && (
          <Filters
            filterValues={filterValues}
            filters={filters}
            onFiltersChange={setFilters}
          />
        )}

        {/* Period & Date Range Controls */}
        {hasData && (
          <div className="flex flex-wrap items-center gap-4 mb-6">
            {/* Period Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">View by:</span>
              <div className="flex bg-white border border-slate-200 rounded-lg p-1">
                <button
                  onClick={() => setPeriod("weekly")}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    period === "weekly"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setPeriod("monthly")}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    period === "monthly"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Range:</span>
              <div className="flex bg-white border border-slate-200 rounded-lg p-1">
                {([
                  { value: "30d", label: "30d" },
                  { value: "90d", label: "90d" },
                  { value: "180d", label: "6m" },
                  { value: "1y", label: "1y" },
                  { value: "all", label: "All" },
                ] as { value: DateRange; label: string }[]).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDateRange(option.value)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      dateRange === option.value
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Claims % Chart */}
        {hasData && (
          <ClaimsChart
            title={`${claimTypeLabel} % of Exposure Days`}
            data={chartData}
            color={chartColor}
          />
        )}

        {/* Claims Over Time Chart */}
        {hasData && (
          <div className="mt-6">
            <ClaimsOverTimeWithControls
              registrations={allRegistrations}
              baseColor={chartColor}
              claimType={claimType}
              calculateClaimsOverTime={calculateClaimsOverTime}
            />
          </div>
        )}

        {/* Cohort Survival Analysis Chart */}
        {hasData && (
          <div className="mt-6">
            <CohortChartWithControls
              registrations={registrations}
              purchaseVolumes={purchaseVolumes}
              claimType={claimType}
              onPurchaseVolumesUpdate={handlePurchaseVolumesUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}

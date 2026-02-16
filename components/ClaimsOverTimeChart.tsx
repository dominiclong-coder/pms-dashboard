"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  StackedChartDataPoint,
  TimePeriod,
  GroupBy,
  applyFilters,
  Filters as FiltersType,
  FilterValues,
} from "@/lib/analytics";
import { Registration } from "@/lib/cache";
import { Filters } from "./Filters";

// Color palette for stacked bars
const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
  "#94a3b8", // slate (for "Other")
];

interface ClaimsOverTimeChartProps {
  data: StackedChartDataPoint[];
  categories: string[];
  baseColor?: string;
  claimType: "warranty" | "return";
  timePeriod: TimePeriod;
}

interface ChartControlsProps {
  timePeriod: TimePeriod;
  groupBy: GroupBy;
  startDate: string;
  endDate: string;
  onTimePeriodChange: (period: TimePeriod) => void;
  onGroupByChange: (groupBy: GroupBy) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

function ChartControls({
  timePeriod,
  groupBy,
  startDate,
  endDate,
  onTimePeriodChange,
  onGroupByChange,
  onStartDateChange,
  onEndDateChange,
}: ChartControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-4">
      {/* Time Period Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Time:</span>
        <div className="flex bg-slate-100 rounded-lg p-1">
          {(["daily", "weekly", "monthly", "yearly"] as TimePeriod[]).map((period) => (
            <button
              key={period}
              onClick={() => onTimePeriodChange(period)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                timePeriod === period
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Selector - always shown */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Date Range:</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-600">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Group By Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Stack by:</span>
        <select
          value={groupBy}
          onChange={(e) => onGroupByChange(e.target.value as GroupBy)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="none">None (Total)</option>
          <option value="productName">Product Name</option>
          <option value="sku">SKU</option>
          <option value="reason">Reason</option>
          <option value="purchaseChannel">Purchase Channel</option>
          <option value="serialNumber">Serial Number</option>
        </select>
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload?: Record<string, unknown> }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    // Check if "Other" is in the payload and has breakdown data
    const otherEntry = payload.find((entry) => entry.name === "Other");
    const otherBreakdown = otherEntry?.payload?.otherBreakdown as Record<string, number> | undefined;

    // If showing "Other" with breakdown, show the breakdown instead of regular entries
    if (otherEntry && otherBreakdown && Object.keys(otherBreakdown).length > 0) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-xs">
          <p className="font-medium text-slate-900 mb-2">{label}</p>
          <p className="text-xs font-semibold text-slate-600 mb-2">Other Categories:</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {Object.entries(otherBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([category, count]) => (
                <div
                  key={category}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="text-slate-600 truncate max-w-[150px]">{category}</span>
                  <span className="font-medium text-slate-900">{count.toLocaleString()}</span>
                </div>
              ))}
          </div>
          <div className="border-t border-slate-200 mt-2 pt-2 text-sm font-medium">
            <span className="text-slate-900">
              Other Total: {otherEntry.value?.toLocaleString()}
            </span>
          </div>
        </div>
      );
    }

    // For individual category lines, show only that entry
    if (payload.length === 1 && payload[0].value) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-xs">
          <p className="font-medium text-slate-900 mb-1">{label}</p>
          <p className="text-sm text-slate-600">
            <span className="font-medium">{payload[0].name}:</span> {payload[0].value?.toLocaleString()}
          </p>
        </div>
      );
    }

    // Fallback: shouldn't happen with current implementation
    return null;
  }
  return null;
}

// Calculate appropriate tick interval based on data length and time period
function getTickInterval(dataLength: number, timePeriod: TimePeriod): number | "preserveStartEnd" {
  if (dataLength <= 12) return 0; // Show all labels
  if (dataLength <= 24) return 1; // Show every other label
  if (dataLength <= 60) return Math.floor(dataLength / 12) - 1;
  if (dataLength <= 120) return Math.floor(dataLength / 10) - 1;
  return Math.floor(dataLength / 8) - 1;
}

// Format shorter labels for daily/weekly view
function getShortLabel(periodLabel: string, timePeriod: TimePeriod): string {
  if (timePeriod === "daily") {
    // "Jan 15, 2024" -> "Jan 15"
    const parts = periodLabel.split(", ");
    return parts[0] || periodLabel;
  }
  if (timePeriod === "weekly") {
    // "Jan 23, 2025" -> "Jan 23" (show just month and day)
    const parts = periodLabel.split(", ");
    return parts[0] || periodLabel;
  }
  return periodLabel;
}

export function ClaimsOverTimeChart({
  data,
  categories,
  baseColor = "#3b82f6",
  claimType,
  timePeriod,
}: ClaimsOverTimeChartProps) {
  // Calculate summary stats
  const totalClaims = useMemo(
    () => data.reduce((sum, d) => sum + d.total, 0),
    [data]
  );

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Claims Over Time</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">
          No data available. Run a sync to load claims data.
        </div>
      </div>
    );
  }

  // Get color for category
  const getCategoryColor = (category: string, index: number): string => {
    if (category === "Other") return COLORS[COLORS.length - 1];
    if (categories.length === 1) return baseColor;
    return COLORS[index % (COLORS.length - 1)];
  };

  // Prepare data with short labels for display
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      shortLabel: getShortLabel(d.periodLabel, timePeriod),
    }));
  }, [data, timePeriod]);

  const tickInterval = getTickInterval(data.length, timePeriod);
  const needsRotation = data.length > 12;
  const needsMoreHeight = data.length > 24;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Claims Over Time</h3>
          {data.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              {data[0].periodLabel} — {data[data.length - 1].periodLabel}
              {" · "}{data.length} {timePeriod === "daily" ? "days" : timePeriod === "weekly" ? "weeks" : timePeriod === "monthly" ? "months" : "years"}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color: baseColor }}>
            {totalClaims.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">total claims</p>
        </div>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 5,
              right: 20,
              left: 10,
              bottom: needsRotation ? (needsMoreHeight ? 80 : 60) : 20,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="shortLabel"
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickLine={{ stroke: "#e2e8f0" }}
              axisLine={{ stroke: "#e2e8f0" }}
              angle={needsRotation ? -45 : 0}
              textAnchor={needsRotation ? "end" : "middle"}
              interval={tickInterval}
              dy={needsRotation ? 5 : 0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={{ stroke: "#e2e8f0" }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickFormatter={(value) => value.toLocaleString()}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            {categories.length > 1 && (
              <Legend
                wrapperStyle={{ paddingTop: "10px" }}
                formatter={(value) => (
                  <span className="text-xs text-slate-600">{value}</span>
                )}
              />
            )}
            {categories.map((category, index) => (
              <Line
                key={category}
                type="monotone"
                dataKey={category}
                stroke={getCategoryColor(category, index)}
                name={category}
                dot={false}
                strokeWidth={2}
                isAnimationActive={true}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Filter data by custom date range
function filterByDateRange(
  data: StackedChartDataPoint[],
  startDate: string,
  endDate: string
): StackedChartDataPoint[] {
  if (!startDate || !endDate || data.length === 0) return data;

  const start = new Date(startDate);
  const end = new Date(endDate);

  return data.filter((d) => {
    const period = d.period;

    if (period.includes("W")) {
      // Weekly: "2024-W01" - get approximate date
      const [year, week] = period.split("-W");
      const weekDate = getDateFromWeek(parseInt(year), parseInt(week));
      return weekDate >= start && weekDate <= end;
    }

    // Daily or monthly: parse period as date
    const periodDate = new Date(period);
    return periodDate >= start && periodDate <= end;
  });
}

// Helper to get approximate date from week number
function getDateFromWeek(year: number, week: number): Date {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  return new Date(jan1.getTime() + days * 24 * 60 * 60 * 1000);
}

// Wrapper component that includes controls and chart
interface ClaimsOverTimeWithControlsProps {
  registrations: Registration[];
  baseColor: string;
  claimType: "warranty" | "return";
  calculateClaimsOverTime: (
    registrations: Registration[],
    period: TimePeriod,
    groupBy: GroupBy,
    claimType: "warranty" | "return"
  ) => { data: StackedChartDataPoint[]; categories: string[] };
  filterValues: FilterValues;
  filters: FiltersType;
  onFiltersChange: (filters: FiltersType) => void;
}

export function ClaimsOverTimeWithControls({
  registrations,
  baseColor,
  claimType,
  calculateClaimsOverTime,
  filterValues,
  filters,
  onFiltersChange,
}: ClaimsOverTimeWithControlsProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("monthly");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  // Initialize default date range (last 1 year from today)
  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const defaultStartDate = oneYearAgo.toISOString().split("T")[0];
  const defaultEndDate = today.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);

  // Apply filters to registrations
  const filteredRegistrations = useMemo(
    () => applyFilters(registrations, filters),
    [registrations, filters]
  );

  const { data: rawData, categories } = useMemo(
    () => calculateClaimsOverTime(filteredRegistrations, timePeriod, groupBy, claimType),
    [filteredRegistrations, timePeriod, groupBy, claimType, calculateClaimsOverTime]
  );

  // Apply date range filter regardless of time period selection
  const data = useMemo(() => {
    return filterByDateRange(rawData, startDate, endDate);
  }, [rawData, startDate, endDate]);

  return (
    <div>
      {/* Filters */}
      <Filters
        filterValues={filterValues}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      <ChartControls
        timePeriod={timePeriod}
        groupBy={groupBy}
        startDate={startDate}
        endDate={endDate}
        onTimePeriodChange={setTimePeriod}
        onGroupByChange={setGroupBy}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />
      <ClaimsOverTimeChart
        data={data}
        categories={categories}
        baseColor={baseColor}
        claimType={claimType}
        timePeriod={timePeriod}
      />
    </div>
  );
}

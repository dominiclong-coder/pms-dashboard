"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Registration, PurchaseVolume } from "@/lib/types";
import {
  LaunchSeries,
  calculateDailyLaunchSurvival,
} from "@/lib/analytics";
import { DropdownMultiSelect } from "./Filters";

interface Props {
  registrations: Registration[];
  purchaseVolumes: PurchaseVolume[];
  claimType: "warranty" | "return";
  availableLots: Record<string, string[]>; // product → lots[]
}

const PRODUCTS = [
  "All Products",
  "Dental Pod",
  "Dental Pod Pro",
  "Dental Pod Go",
  "Zima Go/Zima UV Case",
];

const COLOR_PALETTE = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

const DEFAULT_SERIES: LaunchSeries[] = [
  { id: "a", label: "Series A", product: "All Products", lots: [], startDate: "", color: "#3b82f6" },
  { id: "b", label: "Series B", product: "All Products", lots: [], startDate: "", color: "#ef4444" },
];

function granularityLabel(g: number): string {
  if (g === 1) return "Daily";
  if (g === 7) return "Weekly";
  if (g === 14) return "Fortnightly";
  if (g === 30) return "Monthly";
  return `Every ${g} days`;
}

let nextIdCounter = 3;
function nextId(): string {
  return String.fromCharCode(96 + nextIdCounter++); // c, d, e, f ...
}

export function DailyLaunchChartWithControls({
  registrations,
  purchaseVolumes,
  claimType,
  availableLots,
}: Props) {
  const [series, setSeries] = useState<LaunchSeries[]>(DEFAULT_SERIES);
  const [maxDays, setMaxDays] = useState(30);
  const [granularity, setGranularity] = useState(1);

  // x-axis tick days
  const xAxisDays = useMemo(() => {
    const days: number[] = [];
    for (let d = 0; d <= maxDays; d += granularity) {
      days.push(d);
    }
    // Always include maxDays if not already there
    if (days[days.length - 1] !== maxDays) days.push(maxDays);
    return days;
  }, [maxDays, granularity]);

  // Series with a startDate set
  const seriesWithData = useMemo(
    () => series.filter((s) => s.startDate),
    [series]
  );

  // Compute all series data
  const seriesData = useMemo(() => {
    const result: Record<string, ReturnType<typeof calculateDailyLaunchSurvival>> = {};
    for (const s of seriesWithData) {
      result[s.id] = calculateDailyLaunchSurvival(
        registrations,
        purchaseVolumes,
        s,
        maxDays,
        claimType
      );
    }
    return result;
  }, [registrations, purchaseVolumes, seriesWithData, maxDays, claimType]);

  // Build chart data
  const chartData = useMemo(() => {
    return xAxisDays.map((day) => {
      const point: Record<string, number> = { day };
      for (const s of seriesWithData) {
        const dp = seriesData[s.id]?.find((d) => d.day === day);
        point[s.id] = dp?.claimRate ?? 0;
      }
      return point;
    });
  }, [xAxisDays, seriesWithData, seriesData]);

  const updateSeries = (id: string, patch: Partial<LaunchSeries>) => {
    setSeries((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, ...patch };
        // Reset lots when product changes
        if (patch.product !== undefined && patch.product !== s.product) {
          updated.lots = [];
        }
        return updated;
      })
    );
  };

  const removeSeries = (id: string) => {
    setSeries((prev) => prev.filter((s) => s.id !== id));
  };

  const addSeries = () => {
    if (series.length >= 6) return;
    const colorIndex = series.length % COLOR_PALETTE.length;
    const id = nextId();
    setSeries((prev) => [
      ...prev,
      {
        id,
        label: `Series ${id.toUpperCase()}`,
        product: "All Products",
        lots: [],
        startDate: "",
        color: COLOR_PALETTE[colorIndex],
      },
    ]);
  };

  const hasAnyStartDate = series.some((s) => s.startDate);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Daily Launch Tracker</h2>

      {/* Series config cards */}
      <div className="space-y-3 mb-5">
        {series.map((s) => {
          const lotsForProduct =
            s.product === "All Products"
              ? Array.from(new Set(Object.values(availableLots).flat())).sort()
              : availableLots[s.product] ?? [];

          return (
            <div
              key={s.id}
              className="border border-slate-200 rounded-lg flex overflow-hidden"
            >
              {/* Colour sidebar */}
              <div
                className="w-1 flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />

              <div className="flex-1 p-3 flex flex-wrap items-end gap-3">
                {/* Label */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Label</label>
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => updateSeries(s.id, { label: e.target.value })}
                    className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-28"
                  />
                </div>

                {/* Product */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Product</label>
                  <select
                    value={s.product}
                    onChange={(e) => updateSeries(s.id, { product: e.target.value })}
                    className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PRODUCTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lots */}
                {lotsForProduct.length > 0 && (
                  <div className="min-w-[140px]">
                    <DropdownMultiSelect
                      label="Lots"
                      options={lotsForProduct}
                      selected={s.lots}
                      onChange={(lots) => updateSeries(s.id, { lots })}
                    />
                  </div>
                )}

                {/* Start date */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Start Date</label>
                  <input
                    type="date"
                    value={s.startDate}
                    onChange={(e) => updateSeries(s.id, { startDate: e.target.value })}
                    className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Color picker */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Color</label>
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => updateSeries(s.id, { color: e.target.value })}
                    className="w-9 h-8 p-0.5 border border-slate-200 rounded-md cursor-pointer"
                  />
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeSeries(s.id)}
                  disabled={series.length <= 1}
                  className="mb-0.5 px-2 py-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                  title="Remove series"
                >
                  &#x2715;
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add series button */}
      {series.length < 6 && (
        <button
          onClick={addSeries}
          className="mb-5 px-4 py-2 border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 rounded-lg text-sm transition-colors"
        >
          + Add Series
        </button>
      )}

      {/* Global controls */}
      <div className="flex flex-wrap items-center gap-6 mb-6 p-3 bg-slate-50 rounded-lg border border-slate-100">
        {/* Max days */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Days:</label>
          <input
            type="number"
            min={1}
            max={365}
            value={maxDays}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 365) setMaxDays(v);
            }}
            className="w-20 px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Granularity */}
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">
            Granularity:{" "}
            <span className="font-normal text-slate-500">{granularityLabel(granularity)}</span>
          </label>
          <input
            type="range"
            min={1}
            max={30}
            value={granularity}
            onChange={(e) => setGranularity(parseInt(e.target.value, 10))}
            className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Chart */}
      {!hasAnyStartDate ? (
        <div className="flex items-center justify-center h-48 bg-slate-50 rounded-lg border border-slate-100 text-slate-400 text-sm">
          Set a start date for at least one series to see data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="day"
              type="number"
              domain={[0, maxDays]}
              ticks={xAxisDays}
              label={{ value: "Days since purchase", position: "insideBottom", offset: -15, fontSize: 12, fill: "#64748b" }}
              tick={{ fontSize: 12, fill: "#64748b" }}
            />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              label={{ value: "Claim Rate", angle: -90, position: "insideLeft", offset: 10, fontSize: 12, fill: "#64748b" }}
              tick={{ fontSize: 12, fill: "#64748b" }}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => {
                const s = series.find((sr) => sr.id === String(name ?? ""));
                const displayValue = typeof value === "number" ? `${value.toFixed(2)}%` : String(value ?? "");
                return [displayValue, s?.label ?? String(name ?? "")];
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(label: any) => `Day ${label}`}
            />
            <Legend
              formatter={(value: string) => {
                const s = series.find((sr) => sr.id === value);
                return s?.label ?? value;
              }}
            />
            {seriesWithData.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Valid claims (exposure within warranty/return window)
      </p>
    </div>
  );
}

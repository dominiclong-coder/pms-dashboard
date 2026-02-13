"use client";

import { useState } from "react";
import { CohortDataPoint } from "@/lib/types";

interface CohortHeatmapProps {
  data: CohortDataPoint[];
  maxMonths: number;
}

// Get color for survival rate using Excel-style conditional formatting
// Maps survival rate to a smooth red-orange-yellow-green gradient based on data range
function getSurvivalRateColor(rate: number, hasPurchaseData: boolean, minRate: number, maxRate: number): string {
  if (!hasPurchaseData) return "#f1f5f9"; // Gray for N/A

  // Clamp rate between 0 and 100
  const clampedRate = Math.max(0, Math.min(100, rate));

  // Normalize rate to 0-1 range based on min/max of actual data
  const range = maxRate - minRate;
  const normalizedRate = range === 0 ? 0.5 : (clampedRate - minRate) / range;
  const t = Math.max(0, Math.min(1, normalizedRate)); // Ensure between 0 and 1

  // Excel-style 3-color scale: Red (min) → Yellow/Orange (midpoint) → Green (max)
  // This creates a professional heatmap similar to Excel's conditional formatting
  let r, g, b;

  if (t < 0.5) {
    // Red to Yellow: t = 0 to 0.5
    const t2 = t * 2; // Normalize to 0-1
    r = Math.round(249 - (249 - 250) * t2);    // #f92500 to #facc15: 249 to 250
    g = Math.round(37 + (204 - 37) * t2);      // #f92500 to #facc15: 37 to 204
    b = Math.round(0 + (21 - 0) * t2);         // #f92500 to #facc15: 0 to 21
  } else {
    // Yellow to Green: t = 0.5 to 1
    const t2 = (t - 0.5) * 2; // Normalize to 0-1
    r = Math.round(250 - (250 - 69) * t2);     // #facc15 to #45b446: 250 to 69
    g = Math.round(204 - (204 - 180) * t2);    // #facc15 to #45b446: 204 to 180
    b = Math.round(21 + (70 - 21) * t2);       // #facc15 to #45b446: 21 to 70
  }

  // Convert RGB to hex
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// Get text color for readability based on background brightness
function getTextColor(bgColor: string): string {
  // Parse hex color to RGB
  const hex = bgColor.substring(1);
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate perceived brightness (luminance)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Use white text on dark backgrounds (low luminance), dark text on light backgrounds
  return luminance < 0.5 ? "#ffffff" : "#1e293b";
}

export function CohortHeatmap({ data, maxMonths }: CohortHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ cohort: string; month: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (data.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        No cohort data available. Please select a date range and add purchase volume data.
      </div>
    );
  }

  // Group data by cohort
  const cohortMap = new Map<string, Map<number, CohortDataPoint>>();
  let minSurvivalRate = 100;
  let maxSurvivalRate = 0;

  for (const point of data) {
    if (!cohortMap.has(point.cohortMonth)) {
      cohortMap.set(point.cohortMonth, new Map());
    }
    cohortMap.get(point.cohortMonth)!.set(point.monthsSincePurchase, point);

    // Track min/max survival rates (only for cells with purchase data)
    if (point.purchaseVolume > 0) {
      minSurvivalRate = Math.min(minSurvivalRate, point.survivalRate);
      maxSurvivalRate = Math.max(maxSurvivalRate, point.survivalRate);
    }
  }

  const cohorts = Array.from(cohortMap.keys()).sort();
  const months = Array.from({ length: maxMonths + 1 }, (_, i) => i);

  const handleMouseEnter = (cohort: string, month: number, e: React.MouseEvent) => {
    setHoveredCell({ cohort, month });
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (hoveredCell) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  // Get data point for tooltip
  const getTooltipData = () => {
    if (!hoveredCell) return null;
    const cohortData = cohortMap.get(hoveredCell.cohort);
    if (!cohortData) return null;
    return cohortData.get(hoveredCell.month);
  };

  const tooltipData = getTooltipData();

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 p-3 border-b-2 border-slate-300 text-left font-semibold text-slate-700 min-w-[120px]">
                Purchase Month
              </th>
              {months.map((month) => (
                <th
                  key={month}
                  className="p-3 border-b-2 border-slate-300 text-center font-semibold text-slate-700 min-w-[80px]"
                >
                  {month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => {
              const cohortData = cohortMap.get(cohort)!;
              const firstPoint = cohortData.get(0);

              return (
                <tr key={cohort} className="hover:bg-slate-50">
                  <td className="sticky left-0 bg-white z-10 p-3 border-b border-slate-200 font-medium text-slate-700">
                    {firstPoint?.cohortLabel || cohort}
                  </td>
                  {months.map((month) => {
                    const point = cohortData.get(month);

                    if (!point) {
                      return (
                        <td
                          key={month}
                          className="p-3 border-b border-slate-200 text-center text-slate-400 text-sm"
                        >
                          -
                        </td>
                      );
                    }

                    const hasPurchaseData = point.purchaseVolume > 0;
                    const bgColor = getSurvivalRateColor(point.survivalRate, hasPurchaseData, minSurvivalRate, maxSurvivalRate);
                    const textColor = getTextColor(bgColor);

                    return (
                      <td
                        key={month}
                        className="p-3 border-b border-slate-200 text-center text-sm font-medium cursor-default transition-opacity hover:opacity-80"
                        style={{ backgroundColor: bgColor, color: textColor }}
                        onMouseEnter={(e) => handleMouseEnter(cohort, month, e)}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                      >
                        {hasPurchaseData ? `${point.survivalRate.toFixed(1)}%` : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tooltip */}
      {tooltipData && hoveredCell && (
        <div
          className="fixed bg-white border border-slate-300 rounded-lg shadow-xl p-3 z-50 pointer-events-none"
          style={{
            left: tooltipPos.x + 10,
            top: tooltipPos.y + 10,
            maxWidth: "300px",
          }}
        >
          <p className="font-semibold text-slate-900 mb-2">{tooltipData.cohortLabel}</p>
          <p className="text-sm text-slate-600 mb-1">
            <span className="font-medium">Months since purchase:</span> {tooltipData.monthsSincePurchase}
          </p>
          <p className="text-sm text-slate-600 mb-1">
            <span className="font-medium">Purchase volume:</span> {tooltipData.purchaseVolume.toLocaleString()}
          </p>
          <p className="text-sm text-slate-600 mb-1">
            <span className="font-medium">Cumulative claims:</span> {tooltipData.claimCount.toLocaleString()}
          </p>
          <p className="text-sm font-semibold text-blue-600 mt-2">
            Survival rate: {tooltipData.survivalRate.toFixed(2)}%
          </p>
          <p className="text-sm text-slate-500">
            Claim rate: {tooltipData.claimRate.toFixed(2)}%
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-sm">
        <span className="font-medium text-slate-700">Survival Rate:</span>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded" style={{ backgroundColor: "#f0fdf4" }} />
          <span className="text-slate-600">High (98%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded" style={{ backgroundColor: "#fef9c3" }} />
          <span className="text-slate-600">Good (90-98%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded" style={{ backgroundColor: "#fed7aa" }} />
          <span className="text-slate-600">Fair (70-90%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded" style={{ backgroundColor: "#dc2626" }} />
          <span className="text-slate-600 text-white px-1">Poor (&lt;50%)</span>
        </div>
      </div>
    </div>
  );
}

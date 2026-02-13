"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { ChartDataPoint } from "@/lib/analytics";

interface ClaimsChartProps {
  title: string;
  data: ChartDataPoint[];
  color?: string;
  controlLimits?: {
    mean: number;
    stdDev: number;
    actionLevel: number;
    alertLevel: number;
  };
}

function formatPercentage(value: number): string {
  if (value === 0) return "0%";
  if (value < 0.001) return "<0.001%";
  if (value < 0.01) return value.toFixed(4) + "%";
  if (value < 0.1) return value.toFixed(3) + "%";
  return value.toFixed(2) + "%";
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: ChartDataPoint }>; label?: string }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
        <p className="font-medium text-slate-900">{data.periodLabel}</p>
        <p className="text-sm text-slate-600">
          Claims: <span className="font-medium">{data.claimCount.toLocaleString()}</span>
        </p>
        <p className="text-sm text-slate-600">
          Total Exposure Days: <span className="font-medium">{data.totalExposureDays.toLocaleString()}</span>
        </p>
        <p className="text-sm text-blue-600 font-medium">
          Claims %: {formatPercentage(data.claimsPercentage)}
        </p>
      </div>
    );
  }
  return null;
}

export function ClaimsChart({ title, data, color = "#3b82f6", controlLimits }: ClaimsChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">
          No data available. Run a sync to load claims data.
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const totalClaims = data.reduce((sum, d) => sum + d.claimCount, 0);
  const totalExposureDays = data.reduce((sum, d) => sum + d.totalExposureDays, 0);
  const overallPercentage = totalExposureDays > 0 ? (totalClaims / totalExposureDays) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color }}>
            {formatPercentage(overallPercentage)}
          </p>
          <p className="text-xs text-slate-500">
            {totalClaims.toLocaleString()} claims / {totalExposureDays.toLocaleString()} exposure days
          </p>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="periodLabel"
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickLine={{ stroke: "#e2e8f0" }}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              tickFormatter={(value) => formatPercentage(value)}
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickLine={{ stroke: "#e2e8f0" }}
              axisLine={{ stroke: "#e2e8f0" }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="claimsPercentage"
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: color }}
            />
            {controlLimits && (
              <>
                <ReferenceLine
                  y={controlLimits.mean}
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="0"
                  label={{
                    value: `Mean: ${controlLimits.mean.toFixed(3)}%`,
                    position: "right" as const,
                    fill: "#64748b",
                    fontSize: 11,
                    offset: 5,
                  }}
                />
                <ReferenceLine
                  y={controlLimits.actionLevel}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{
                    value: `Action: ${controlLimits.actionLevel.toFixed(3)}%`,
                    position: "right" as const,
                    fill: "#f59e0b",
                    fontSize: 11,
                    offset: 5,
                  }}
                />
                <ReferenceLine
                  y={controlLimits.alertLevel}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{
                    value: `Alert: ${controlLimits.alertLevel.toFixed(3)}%`,
                    position: "right" as const,
                    fill: "#ef4444",
                    fontSize: 11,
                    offset: 5,
                  }}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

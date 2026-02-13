"use client";

import { useState, useMemo, useEffect } from "react";
import { Registration, PurchaseVolume, PurchaseVolumeData } from "@/lib/types";
import { calculateCohortSurvival } from "@/lib/analytics";
import { CohortHeatmap } from "./CohortHeatmap";
import { PurchaseVolumeModal } from "./PurchaseVolumeModal";

interface CohortChartWithControlsProps {
  registrations: Registration[];
  purchaseVolumes: PurchaseVolume[];
  claimType: "warranty" | "return";
  onPurchaseVolumesUpdate: (data: PurchaseVolumeData) => Promise<void>;
}

const PRODUCTS = [
  "All Products",
  "Dental Pod Go",
  "Dental Pod",
  "Dental Pod Pro",
  "Zima Go/Zima UV Case/Zima Case Air",
];

// Generate list of available months (only complete months)
function generateAvailableMonths(): string[] {
  const months: string[] = [];
  const now = new Date();

  // Get the last complete month
  const lastCompleteMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Start from Jan 2023
  const start = new Date(2023, 0, 1);

  let current = new Date(start);
  while (current <= lastCompleteMonth) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    months.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

// Format month for display
function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

// Calculate default date range based on claim type
function calculateDefaultMonths(
  availableMonths: string[],
  claimType: "warranty" | "return"
): { startMonth: string; endMonth: string } {
  if (availableMonths.length === 0) {
    return { startMonth: "", endMonth: "" };
  }

  const endMonth = availableMonths[availableMonths.length - 1];

  if (claimType === "warranty") {
    // Warranty: Last 12 months from most recent month
    const startIndex = Math.max(0, availableMonths.length - 12);
    return { startMonth: availableMonths[startIndex], endMonth };
  } else {
    // Return: Last 12 months OR Aug 2025 onwards (whichever gives MORE data)
    const startIndexLast12 = Math.max(0, availableMonths.length - 12);
    const aug2025Index = availableMonths.findIndex(m => m === "2025-08");

    if (aug2025Index === -1) {
      // Aug 2025 doesn't exist - use last 12 months
      return { startMonth: availableMonths[startIndexLast12], endMonth };
    }

    // Calculate which gives more data points
    const monthsFromLast12 = availableMonths.length - startIndexLast12;
    const monthsFromAug2025 = availableMonths.length - aug2025Index;

    // Use whichever gives MORE data
    if (monthsFromAug2025 > monthsFromLast12) {
      return { startMonth: availableMonths[aug2025Index], endMonth };
    } else {
      return { startMonth: availableMonths[startIndexLast12], endMonth };
    }
  }
}

export function CohortChartWithControls({
  registrations,
  purchaseVolumes,
  claimType,
  onPurchaseVolumesUpdate,
}: CohortChartWithControlsProps) {
  const availableMonths = useMemo(() => generateAvailableMonths(), []);

  const [productFilter, setProductFilter] = useState<string>("All Products");
  const [startMonth, setStartMonth] = useState<string>("");
  const [endMonth, setEndMonth] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Set defaults based on claim type
  useEffect(() => {
    const defaults = calculateDefaultMonths(availableMonths, claimType);
    setStartMonth(defaults.startMonth);
    setEndMonth(defaults.endMonth);
  }, [availableMonths, claimType]);

  // Calculate cohort data
  const cohortData = useMemo(() => {
    return calculateCohortSurvival(
      registrations,
      purchaseVolumes,
      productFilter,
      startMonth,
      endMonth,
      claimType
    );
  }, [registrations, purchaseVolumes, productFilter, startMonth, endMonth, claimType]);

  const maxMonths = claimType === "warranty" ? 12 : 1;

  const handleSavePurchaseVolumes = async (data: PurchaseVolumeData) => {
    await onPurchaseVolumesUpdate(data);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {/* Header & Controls */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Cohort Survival Analysis {claimType === "warranty" && "(Shopify Only)"}
        </h3>

        <div className="flex flex-wrap items-center gap-4">
          {/* Product Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">Product:</label>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PRODUCTS.map((product) => (
                <option key={product} value={product}>
                  {product}
                </option>
              ))}
            </select>
          </div>

          {/* Start Month */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">From:</label>
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </div>

          {/* End Month */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 font-medium">To:</label>
            <select
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </div>

          {/* Update Purchase Data Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Update Purchase Data
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Showing survival rates (% of buyers who have NOT filed a claim) by purchase cohort.
          Higher percentages indicate fewer claims.
        </p>
      </div>

      {/* Heatmap */}
      <CohortHeatmap data={cohortData} maxMonths={maxMonths} />

      {/* Modal */}
      <PurchaseVolumeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        purchaseVolumes={purchaseVolumes}
        onSave={handleSavePurchaseVolumes}
      />
    </div>
  );
}

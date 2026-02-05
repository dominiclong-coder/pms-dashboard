"use client";

import { useState, useEffect } from "react";
import { PurchaseVolume, PurchaseVolumeData } from "@/lib/types";

interface PurchaseVolumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseVolumes: PurchaseVolume[];
  onSave: (data: PurchaseVolumeData) => Promise<void>;
}

const PRODUCTS = [
  "All Products",
  "Dental Pod Go",
  "Dental Pod",
  "Dental Pod Pro",
  "Zima Go/Zima UV Case/Zima Case Air",
];

// Get list of months from earliest data to most recent FULL month
function generateMonthList(): string[] {
  const months: string[] = [];
  const now = new Date();

  // Get the last complete month (not current month)
  const lastCompleteMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Start from Jan 2023 (adjust as needed based on your data)
  const start = new Date(2023, 0, 1);

  let current = new Date(start);
  while (current <= lastCompleteMonth) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    months.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months.reverse(); // Most recent first
}

export function PurchaseVolumeModal({
  isOpen,
  onClose,
  purchaseVolumes,
  onSave,
}: PurchaseVolumeModalProps) {
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months = generateMonthList();

  // Initialize volumes from props
  useEffect(() => {
    const volumeMap: Record<string, number> = {};
    for (const pv of purchaseVolumes) {
      const key = `${pv.yearMonth}|${pv.product}`;
      volumeMap[key] = pv.purchaseCount;
    }
    setVolumes(volumeMap);
  }, [purchaseVolumes, isOpen]);

  if (!isOpen) return null;

  const handleChange = (month: string, product: string, value: string) => {
    const key = `${month}|${product}`;
    const numValue = value === "" ? 0 : parseInt(value, 10);

    if (value !== "" && (isNaN(numValue) || numValue < 0)) {
      return; // Ignore invalid input
    }

    setVolumes((prev) => ({
      ...prev,
      [key]: numValue,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Convert volumes map to array
      const volumeArray: PurchaseVolume[] = [];
      for (const [key, count] of Object.entries(volumes)) {
        if (count > 0) {
          const [yearMonth, product] = key.split("|");
          volumeArray.push({ yearMonth, product, purchaseCount: count });
        }
      }

      await onSave({
        volumes: volumeArray,
        lastUpdated: new Date().toISOString(),
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setError(null);
    onClose();
  };

  // Format month for display
  const formatMonth = (yearMonth: string): string => {
    const [year, month] = yearMonth.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">Update Purchase Volumes</h2>
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-sm text-slate-600">
            Enter the number of units sold per month and product. Data is shown up to the most recent complete month.
          </p>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 pb-4">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="text-left p-3 border-b-2 border-slate-300 font-semibold text-slate-700 bg-slate-50">
                  Month
                </th>
                {PRODUCTS.map((product) => (
                  <th
                    key={product}
                    className="text-left p-3 border-b-2 border-slate-300 font-semibold text-slate-700 bg-slate-50 min-w-[120px]"
                  >
                    {product}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month} className="hover:bg-slate-50">
                  <td className="p-3 border-b border-slate-200 font-medium text-slate-700">
                    {formatMonth(month)}
                  </td>
                  {PRODUCTS.map((product) => {
                    const key = `${month}|${product}`;
                    const value = volumes[key] || 0;
                    return (
                      <td key={product} className="p-3 border-b border-slate-200">
                        <input
                          type="number"
                          min="0"
                          value={value || ""}
                          onChange={(e) => handleChange(month, product, e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              💡 Tip: Leave blank or enter 0 if no data available for that month
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSaving && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

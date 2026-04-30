"use client";

import { useState, useEffect } from "react";
import { PurchaseVolume, PurchaseVolumeData } from "@/lib/types";

interface PurchaseVolumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseVolumes: PurchaseVolume[];
  onSave: (data: PurchaseVolumeData) => Promise<void>;
}

const PRODUCTS: { id: string; label: string }[] = [
  { id: "Dental Pod",                          label: "Dental Pod" },
  { id: "Dental Pod Pro",                      label: "Dental Pod Pro" },
  { id: "Dental Pod Go",                       label: "Dental Pod Go" },
  { id: "Zima UV Case",                label: "Zima UV Case" },
];

// Dynamic month range: Dec 2024 → 3 months ahead of today, most recent first
const MONTHS: string[] = (() => {
  const list: string[] = [];
  const start = new Date(2024, 11, 1); // Dec 2024
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 1); // 3 months ahead
  for (let d = new Date(end); d >= start; d.setMonth(d.getMonth() - 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    list.push(`${y}-${m}`);
  }
  return list;
})();

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function daysInMonth(ym: string): number {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

// Volume key: "yearMonth|productId|LOT"
function volumeKey(ym: string, product: string, lot: string): string {
  return `${ym}|${product}|${lot.toUpperCase()}`;
}

// Daily volume key: "YYYY-MM-DD|productId|LOT"
function dailyVolumeKey(date: string, product: string, lot: string): string {
  return `${date}|${product}|${lot.toUpperCase()}`;
}

export function PurchaseVolumeModal({
  isOpen,
  onClose,
  purchaseVolumes,
  onSave,
}: PurchaseVolumeModalProps) {
  const [selectedProduct, setSelectedProduct] = useState(PRODUCTS[0].id);
  const [lotsByProduct, setLotsByProduct]     = useState<Record<string, string[]>>({});
  const [volumes, setVolumes]                 = useState<Record<string, number>>({});
  const [dailyVolumes, setDailyVolumes]       = useState<Record<string, number>>({});
  const [expandedMonths, setExpandedMonths]   = useState<Set<string>>(new Set());
  const [newLot, setNewLot]                   = useState("");
  const [isSaving, setIsSaving]               = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // Initialise from existing Firebase data
  useEffect(() => {
    if (!isOpen) return;
    const vols: Record<string, number> = {};
    const dailyVols: Record<string, number> = {};
    const lots: Record<string, string[]> = {};

    for (const pv of purchaseVolumes) {
      const lot = pv.lot ? pv.lot.toUpperCase() : "";
      vols[volumeKey(pv.yearMonth, pv.product, lot)] = pv.purchaseCount;
      if (lot) {
        if (!lots[pv.product]) lots[pv.product] = [];
        if (!lots[pv.product].includes(lot)) lots[pv.product].push(lot);
      }

      // Load daily counts
      if (pv.dailyCounts) {
        for (const [dateStr, count] of Object.entries(pv.dailyCounts)) {
          if (count > 0) {
            dailyVols[dailyVolumeKey(dateStr, pv.product, lot)] = count;
          }
        }
      }
    }
    setVolumes(vols);
    setDailyVolumes(dailyVols);
    setLotsByProduct(lots);
    setExpandedMonths(new Set());
  }, [purchaseVolumes, isOpen]);

  if (!isOpen) return null;

  const currentLots = lotsByProduct[selectedProduct] ?? [];

  // Add a lot to the current product
  const handleAddLot = () => {
    const lot = newLot.trim().toUpperCase();
    if (!lot) return;
    setLotsByProduct((prev) => {
      const existing = prev[selectedProduct] ?? [];
      if (existing.includes(lot)) return prev;
      return { ...prev, [selectedProduct]: [...existing, lot] };
    });
    setNewLot("");
  };

  // Remove a lot and clear its volumes
  const handleRemoveLot = (lot: string) => {
    setLotsByProduct((prev) => ({
      ...prev,
      [selectedProduct]: (prev[selectedProduct] ?? []).filter((l) => l !== lot),
    }));
    setVolumes((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const parts = key.split("|");
        if (parts[1] === selectedProduct && parts[2] === lot) delete next[key];
      }
      return next;
    });
    setDailyVolumes((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const parts = key.split("|");
        if (parts[1] === selectedProduct && parts[2] === lot) delete next[key];
      }
      return next;
    });
  };

  const handleChange = (ym: string, lot: string, value: string) => {
    const num = value === "" ? 0 : parseInt(value, 10);
    if (value !== "" && (isNaN(num) || num < 0)) return;
    setVolumes((prev) => ({ ...prev, [volumeKey(ym, selectedProduct, lot)]: num }));
  };

  const handleDailyChange = (dateStr: string, lot: string, value: string) => {
    const num = value === "" ? 0 : parseInt(value, 10);
    if (value !== "" && (isNaN(num) || num < 0)) return;
    setDailyVolumes((prev) => ({
      ...prev,
      [dailyVolumeKey(dateStr, selectedProduct, lot)]: num,
    }));
  };

  const toggleMonth = (ym: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(ym)) next.delete(ym);
      else next.add(ym);
      return next;
    });
  };

  // Get sum of daily entries for a month/lot combination
  const getDailySum = (ym: string, lot: string): number => {
    const [year, month] = ym.split("-");
    const days = daysInMonth(ym);
    let sum = 0;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${month}-${String(d).padStart(2, "0")}`;
      sum += dailyVolumes[dailyVolumeKey(dateStr, selectedProduct, lot)] || 0;
    }
    return sum;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Build a map keyed by "yearMonth|product|lot" holding all the data we need
      const volumeMap = new Map<string, { yearMonth: string; product: string; lot: string | null; purchaseCount: number; dailyCounts: Record<string, number> }>();

      // Seed from monthly volumes
      for (const [key, count] of Object.entries(volumes)) {
        if (count > 0) {
          const parts = key.split("|");
          const ym = parts[0] ?? "";
          const product = parts[1] ?? "";
          const lotStr = parts[2] || null;
          const mapKey = `${ym}|${product}|${lotStr ?? ""}`;
          if (!volumeMap.has(mapKey)) {
            volumeMap.set(mapKey, { yearMonth: ym, product, lot: lotStr, purchaseCount: count, dailyCounts: {} });
          } else {
            volumeMap.get(mapKey)!.purchaseCount = count;
          }
        }
      }

      // Add daily volumes
      for (const [key, count] of Object.entries(dailyVolumes)) {
        if (count > 0) {
          const parts = key.split("|");
          // key format: "YYYY-MM-DD|product|LOT"
          const dateStr = parts[0] ?? "";
          const product = parts[1] ?? "";
          const lotStr = parts[2] || null;
          const ym = dateStr.substring(0, 7); // "YYYY-MM"
          const mapKey = `${ym}|${product}|${lotStr ?? ""}`;

          if (!volumeMap.has(mapKey)) {
            // Monthly entry may be 0 — still create a record so daily data is saved
            const monthlyCount = volumes[volumeKey(ym, product, lotStr ?? "")] || 0;
            volumeMap.set(mapKey, { yearMonth: ym, product, lot: lotStr, purchaseCount: monthlyCount, dailyCounts: {} });
          }
          volumeMap.get(mapKey)!.dailyCounts[dateStr] = count;
        }
      }

      const volumeArray: PurchaseVolume[] = Array.from(volumeMap.values()).map((entry) => ({
        yearMonth: entry.yearMonth,
        product: entry.product,
        lot: entry.lot,
        purchaseCount: entry.purchaseCount,
        ...(Object.keys(entry.dailyCounts).length > 0 ? { dailyCounts: entry.dailyCounts } : {}),
      }));

      await onSave({ volumes: volumeArray, lastUpdated: new Date().toISOString() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // Total units for current product
  const productTotal = Object.entries(volumes)
    .filter(([k]) => k.split("|")[1] === selectedProduct)
    .reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Purchase Volumes</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Product tabs */}
        <div className="flex border-b border-slate-200 px-6 pt-3 gap-1">
          {PRODUCTS.map((p) => {
            const isActive = selectedProduct === p.id;
            const lotCount = (lotsByProduct[p.id] ?? []).length;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600 bg-blue-50"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p.label}
                {lotCount > 0 && (
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    {lotCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Lot management */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-slate-600">Add lot:</span>
          <input
            type="text"
            value={newLot}
            onChange={(e) => setNewLot(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddLot()}
            placeholder="e.g. 202503-DP"
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase placeholder:normal-case w-40"
          />
          <button
            onClick={handleAddLot}
            disabled={!newLot.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Add
          </button>

          {/* Lot chips */}
          {currentLots.map((lot) => (
            <span
              key={lot}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 text-sm rounded-full font-mono"
            >
              {lot}
              <button
                onClick={() => handleRemoveLot(lot)}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}

          <span className="ml-auto text-sm text-slate-400">
            Total: <span className="font-semibold text-slate-600">{productTotal.toLocaleString()}</span> units
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600 w-36">
                  Month
                </th>
                {currentLots.map((lot) => (
                  <th key={lot} className="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600 font-mono min-w-[150px]">
                    {lot}
                  </th>
                ))}
                <th className="text-left px-3 py-2 border-b-2 border-slate-200 font-semibold text-slate-600 min-w-[150px]">
                  Unknown lot
                </th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((ym) => {
                const isExpanded = expandedMonths.has(ym);
                const [ymYear, ymMonth] = ym.split("-");
                const days = daysInMonth(ym);

                return (
                  <>
                    {/* Monthly row */}
                    <tr key={ym} className="hover:bg-slate-50">
                      <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleMonth(ym)}
                            className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                            title={isExpanded ? "Collapse daily breakdown" : "Expand daily breakdown"}
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          {formatMonth(ym)}
                        </div>
                      </td>
                      {currentLots.map((lot) => {
                        const val = volumes[volumeKey(ym, selectedProduct, lot)] || 0;
                        const dailySum = getDailySum(ym, lot);
                        return (
                          <td key={lot} className="px-3 py-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={val || ""}
                                onChange={(e) => handleChange(ym, lot, e.target.value)}
                                placeholder="0"
                                className="w-24 px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                              {dailySum > 0 && (
                                <span className="text-xs text-slate-400 whitespace-nowrap">(sum: {dailySum})</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={volumes[volumeKey(ym, selectedProduct, "")] || ""}
                            onChange={(e) => handleChange(ym, "", e.target.value)}
                            placeholder="0"
                            className="w-24 px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                          {(() => {
                            const dailySum = getDailySum(ym, "");
                            return dailySum > 0 ? (
                              <span className="text-xs text-slate-400 whitespace-nowrap">(sum: {dailySum})</span>
                            ) : null;
                          })()}
                        </div>
                      </td>
                    </tr>

                    {/* Daily sub-rows */}
                    {isExpanded && Array.from({ length: days }, (_, i) => i + 1).map((day) => {
                      const dayStr = String(day).padStart(2, "0");
                      const dateStr = `${ymYear}-${ymMonth}-${dayStr}`;
                      const displayDate = `${dayStr}/${ymMonth}/${ymYear}`;

                      return (
                        <tr key={dateStr} className="bg-slate-50 hover:bg-slate-100">
                          <td className="pl-8 pr-3 py-1 border-b border-slate-100 text-slate-500 text-xs font-mono whitespace-nowrap">
                            {displayDate}
                          </td>
                          {currentLots.map((lot) => {
                            const val = dailyVolumes[dailyVolumeKey(dateStr, selectedProduct, lot)] || 0;
                            return (
                              <td key={lot} className="px-3 py-1 border-b border-slate-100">
                                <input
                                  type="number"
                                  min="0"
                                  value={val || ""}
                                  onChange={(e) => handleDailyChange(dateStr, lot, e.target.value)}
                                  placeholder="0"
                                  className="w-24 px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                                />
                              </td>
                            );
                          })}
                          <td className="px-3 py-1 border-b border-slate-100">
                            <input
                              type="number"
                              min="0"
                              value={dailyVolumes[dailyVolumeKey(dateStr, selectedProduct, "")] || ""}
                              onChange={(e) => handleDailyChange(dateStr, "", e.target.value)}
                              placeholder="0"
                              className="w-24 px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <p className="text-xs text-slate-400">Lot numbers are stored in uppercase. Click the chevron on any month to enter daily breakdowns.</p>
          )}
          <div className="flex gap-3 shrink-0">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors flex items-center gap-2"
            >
              {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

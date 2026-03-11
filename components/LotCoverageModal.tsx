"use client";

import { useMemo } from "react";
import { Registration } from "@/lib/types";
import { PurchaseVolume } from "@/lib/types";
import { extractProductType } from "@/lib/analytics";

interface LotCoverageModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrations: Registration[];
  purchaseVolumes: PurchaseVolume[];
}

export function LotCoverageModal({
  isOpen,
  onClose,
  registrations,
  purchaseVolumes,
}: LotCoverageModalProps) {
  const analysis = useMemo(() => {
    // Get all known purchase lot numbers (non-null, uppercased)
    const purchaseLots = new Set(
      purchaseVolumes
        .map((pv) => pv.lot?.toUpperCase())
        .filter((l): l is string => !!l)
    );

    // Count how each serial number appears across all registrations
    const serialCounts = new Map<string, number>();
    let totalWithSerial = 0;
    let totalWithoutSerial = 0;
    let matched = 0;
    let unmatched = 0;

    for (const reg of registrations) {
      const sn = reg.serialNumbers?.[0]?.trim();
      if (!sn) {
        totalWithoutSerial++;
        continue;
      }
      totalWithSerial++;
      const upper = sn.toUpperCase();
      serialCounts.set(upper, (serialCounts.get(upper) ?? 0) + 1);
      if (purchaseLots.has(upper)) {
        matched++;
      } else {
        unmatched++;
      }
    }

    // Split serial counts into matched / unmatched groups, sorted by frequency
    const matchedRows: { sn: string; count: number }[] = [];
    const unmatchedRows: { sn: string; count: number }[] = [];
    for (const [sn, count] of serialCounts) {
      if (purchaseLots.has(sn)) {
        matchedRows.push({ sn, count });
      } else {
        unmatchedRows.push({ sn, count });
      }
    }
    matchedRows.sort((a, b) => b.count - a.count);
    unmatchedRows.sort((a, b) => b.count - a.count);

    return {
      totalClaims: registrations.length,
      totalWithSerial,
      totalWithoutSerial,
      matched,
      unmatched,
      purchaseLots: Array.from(purchaseLots).sort(),
      matchedRows,
      unmatchedRows,
    };
  }, [registrations, purchaseVolumes]);

  if (!isOpen) return null;

  const matchPct =
    analysis.totalWithSerial > 0
      ? ((analysis.matched / analysis.totalWithSerial) * 100).toFixed(1)
      : "0.0";
  const unmatchPct =
    analysis.totalWithSerial > 0
      ? ((analysis.unmatched / analysis.totalWithSerial) * 100).toFixed(1)
      : "0.0";
  const serialPct =
    analysis.totalClaims > 0
      ? ((analysis.totalWithSerial / analysis.totalClaims) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Lot Coverage Analysis</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-light leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Total claims"
              value={analysis.totalClaims.toLocaleString()}
            />
            <StatCard
              label="Have a serial number"
              value={`${analysis.totalWithSerial.toLocaleString()} (${serialPct}%)`}
            />
            <StatCard
              label="No serial number"
              value={analysis.totalWithoutSerial.toLocaleString()}
              muted
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Match a purchase lot"
              value={`${analysis.matched.toLocaleString()} (${matchPct}%)`}
              accent="green"
            />
            <StatCard
              label="No matching purchase lot"
              value={`${analysis.unmatched.toLocaleString()} (${unmatchPct}%)`}
              accent="red"
            />
          </div>

          {/* Known purchase lots */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Known purchase lots ({analysis.purchaseLots.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {analysis.purchaseLots.map((lot) => (
                <span
                  key={lot}
                  className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-mono"
                >
                  {lot}
                </span>
              ))}
            </div>
          </section>

          {/* Unmatched serial numbers */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Unmatched serial numbers — unique values ({analysis.unmatchedRows.length})
            </h3>
            {analysis.unmatchedRows.length === 0 ? (
              <p className="text-sm text-slate-500">All serial numbers match a purchase lot.</p>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Serial number (as entered)</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Claims</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.unmatchedRows.map(({ sn, count }) => (
                      <tr key={sn} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-mono text-slate-800">{sn}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Matched serial numbers */}
          {analysis.matchedRows.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                Matched serial numbers
              </h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Lot</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Claims</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.matchedRows.map(({ sn, count }) => (
                      <tr key={sn} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-mono text-slate-800">{sn}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  muted = false,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: "green" | "red";
}) {
  const bg = accent === "green"
    ? "bg-green-50 border-green-200"
    : accent === "red"
    ? "bg-red-50 border-red-200"
    : "bg-slate-50 border-slate-200";
  const valueColor = accent === "green"
    ? "text-green-700"
    : accent === "red"
    ? "text-red-700"
    : muted
    ? "text-slate-400"
    : "text-slate-900";

  return (
    <div className={`border rounded-lg p-3 ${bg}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

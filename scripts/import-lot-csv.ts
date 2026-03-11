#!/usr/bin/env tsx
/**
 * Import pivoted lot CSV into Firebase purchase-volumes.
 * Usage: npx tsx scripts/import-lot-csv.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { savePurchaseVolumes } from "../lib/firebase";
import { PurchaseVolume } from "../lib/types";

const CSV_PATH = path.join(
  process.env.HOME ?? "~",
  "Downloads",
  "pivoted_lot_numbers_by_product_category.csv"
);

const PRODUCT_MAP: Record<string, string> = {
  "Dental Pod":     "Dental Pod",
  "Dental Pod Pro": "Dental Pod Pro",
  "Dental Pod Go":  "Dental Pod Go",
  "Zima UV":        "Zima Go/Zima UV Case",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const lines = csv.trim().split("\n").filter(Boolean);
  const headers = lines[0].split(",");

  // Columns: [0] yearMonth, [1] product category, [2..] lot headers
  const lotHeaders = headers.slice(2).map(h => h.trim());

  const volumes: PurchaseVolume[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(",");
    const yearMonth     = fields[0]?.trim() ?? "";
    const productCategory = fields[1]?.trim() ?? "";

    const product = PRODUCT_MAP[productCategory];
    if (!product) continue; // skip "Other"

    for (let j = 0; j < lotHeaders.length; j++) {
      const qty = Math.round(parseFloat(fields[j + 2] ?? "0") || 0);
      if (qty === 0) continue;

      const lotHeader = lotHeaders[j] ?? "";
      // "Unknown" → null lot; otherwise normalise to uppercase
      const lot = lotHeader === "Unknown" ? null : lotHeader.toUpperCase();

      volumes.push({ yearMonth, product, lot, purchaseCount: qty });
    }
  }

  // Summary
  console.log(`\nParsed ${volumes.length} volume entries\n`);

  const productTotals: Record<string, number> = {};
  const lotSet = new Set<string>();
  for (const v of volumes) {
    productTotals[v.product] = (productTotals[v.product] ?? 0) + v.purchaseCount;
    if (v.lot) lotSet.add(v.lot);
  }

  console.log("Units per product:");
  for (const [p, total] of Object.entries(productTotals).sort()) {
    console.log(`  ${p}: ${total.toLocaleString()}`);
  }
  console.log(`\nUnique lots: ${lotSet.size}`);
  console.log(`  ${[...lotSet].sort().join(", ")}`);

  if (dryRun) {
    console.log("\nDRY RUN — no data written.");
    return;
  }

  console.log("\nWriting to Firebase...");
  await savePurchaseVolumes({ volumes, lastUpdated: new Date().toISOString() });
  console.log("Done.");
}

main().catch(err => { console.error(err); process.exit(1); });

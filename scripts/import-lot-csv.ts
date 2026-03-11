#!/usr/bin/env tsx
/**
 * Import pivoted Zima lot CSV into Firebase purchase-volumes,
 * merging with (not replacing) the existing data from the ShipBob import.
 *
 * Only processes "Zima UV" rows from the CSV — all other products retain
 * their existing Firebase data from the ShipBob CSV import.
 *
 * Usage: npx tsx scripts/import-lot-csv.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { savePurchaseVolumes, loadPurchaseVolumes } from "../lib/firebase";
import { PurchaseVolume } from "../lib/types";

const CSV_PATH = path.join(
  process.env.HOME ?? "~",
  "Downloads",
  "pivoted_lot_numbers_by_product_category.csv"
);

// Only the Zima product is sourced from this CSV.
// Dental Pod / Pro / Go data comes from the ShipBob CSV import and must be preserved.
const ZIMA_CATEGORY = "Zima UV";
const ZIMA_PRODUCT  = "Zima Go/Zima UV Case";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // ---------------------------------------------------------------------------
  // 1. Parse lot CSV — Zima UV rows only
  // ---------------------------------------------------------------------------
  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const lines = csv.trim().split("\n").filter(Boolean);
  const headers = lines[0].split(",");

  // Columns: [0] yearMonth, [1] product category, [2..] lot headers
  const lotHeaders = headers.slice(2).map(h => h.trim());

  const zimaVolumes: PurchaseVolume[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(",");
    const productCategory = fields[1]?.trim() ?? "";

    if (productCategory !== ZIMA_CATEGORY) continue;

    const yearMonth = fields[0]?.trim() ?? "";

    for (let j = 0; j < lotHeaders.length; j++) {
      const qty = Math.round(parseFloat(fields[j + 2] ?? "0") || 0);
      if (qty === 0) continue;

      const lotHeader = lotHeaders[j] ?? "";
      // "Unknown" → null lot; otherwise normalise to uppercase
      const lot = lotHeader === "Unknown" ? null : lotHeader.toUpperCase();

      zimaVolumes.push({ yearMonth, product: ZIMA_PRODUCT, lot, purchaseCount: qty });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Load existing Firebase purchase volumes
  // ---------------------------------------------------------------------------
  console.log("Loading existing purchase volumes from Firebase...");
  const existing = await loadPurchaseVolumes();

  // Keep all non-Zima entries from the ShipBob import
  const nonZimaVolumes = existing.volumes.filter(
    v => v.product !== ZIMA_PRODUCT && v.product !== "Zima Go/Zima UV Case/Zima Case Air"
  );

  // ---------------------------------------------------------------------------
  // 3. Merge: non-Zima from Firebase + Zima from lot CSV
  // ---------------------------------------------------------------------------
  const merged = [...nonZimaVolumes, ...zimaVolumes];

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nExisting non-Zima entries kept: ${nonZimaVolumes.length}`);
  console.log(`Zima entries from lot CSV:        ${zimaVolumes.length}`);
  console.log(`Total merged entries:             ${merged.length}\n`);

  const productTotals: Record<string, number> = {};
  const lotSet = new Set<string>();
  for (const v of merged) {
    productTotals[v.product] = (productTotals[v.product] ?? 0) + v.purchaseCount;
    if (v.lot) lotSet.add(v.lot);
  }

  console.log("Units per product (merged):");
  for (const [p, total] of Object.entries(productTotals).sort()) {
    console.log(`  ${p}: ${total.toLocaleString()}`);
  }

  const zimaLots = new Set(zimaVolumes.filter(v => v.lot).map(v => v.lot!));
  console.log(`\nZima lots from CSV (${zimaLots.size}): ${[...zimaLots].sort().join(", ")}`);

  if (dryRun) {
    console.log("\nDRY RUN — no data written to Firebase.");
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. Write merged data to Firebase
  // ---------------------------------------------------------------------------
  console.log("\nWriting merged purchase volumes to Firebase...");
  await savePurchaseVolumes({ volumes: merged, lastUpdated: new Date().toISOString() });
  console.log("Done.");
}

main().catch(err => { console.error(err); process.exit(1); });

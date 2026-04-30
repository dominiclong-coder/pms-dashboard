#!/usr/bin/env tsx
/**
 * Import ShipBob CSV export into Firebase.
 *
 * Writes to:
 *   purchase-volumes/current  — aggregated units per yearMonth × product × lot,
 *                               with per-day breakdown in dailyCounts
 *
 * Usage:
 *   npx tsx scripts/import-shipbob-csv.ts [--dry-run] [path/to/file.csv]
 *
 * Default CSV path: ~/Downloads/OrdersExport_20260428_b5ed8a7d.csv
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { savePurchaseVolumes, loadPurchaseVolumes } from "../lib/firebase";
import { PurchaseVolume } from "../lib/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CSV_PATH = path.join(
  process.env.HOME ?? "~",
  "Downloads",
  "OrdersExport_20260428_b5ed8a7d.csv"
);

const EXCLUDED_CHANNEL = "zima-pro-usa";
const ALLOWED_STATUSES = new Set(["Completed", "Shipped"]);

const ZIMA           = "Zima Go/Zima UV Case";
const ZIMA_CASE_AIR  = "Zima Case Air";

/**
 * Map a ShipBob line item name to one or more product strings.
 * Returns an empty array if the line item is not a tracked product.
 *
 * 360 Bundles contain both a Dental Pod (or Pro) AND a Zima UV Case.
 * Travel bundles contain only a Zima case.
 */
function getProductsFromName(name: string): string[] {
  const n = name.toLowerCase();

  // Exclude accessories/consumables that contain product names but are not devices
  if (/tablet|wipe|\blid\b|zima\s*fresh/i.test(n)) return [];

  if (/travel bundle/i.test(n)) return [ZIMA];
  if (/bundle/i.test(n)) {
    return /pro/i.test(n) ? ["Dental Pod Pro", ZIMA] : ["Dental Pod", ZIMA];
  }
  if (/dental pod go/i.test(n))  return ["Dental Pod Go"];
  if (/dental pod pro/i.test(n)) return ["Dental Pod Pro"];
  if (/dental pod/i.test(n))     return ["Dental Pod"];
  if (/zima case air/i.test(n))        return [ZIMA_CASE_AIR];
  if (/zima uv case|zima go/i.test(n)) return [ZIMA];

  return [];
}

// Progress logging interval
const PROGRESS_INTERVAL = 50_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Key: "yearMonth|product|lot" (lot="" for null) → total qty
type VolumeMap = Map<string, number>;

// Key: "yearMonth|product|lot" → (date "YYYY-MM-DD" → qty)
type DailyMap = Map<string, Map<string, number>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line, respecting quoted fields that may contain commas.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Extract YYYY-MM from a ShipBob date string.
 * ShipBob CSV uses MM/DD/YYYY format (e.g. "12/07/2024").
 * Falls back to YYYY-MM-DD slice for ISO-format dates.
 */
function toYearMonth(dateStr: string): string {
  if (dateStr.includes("/")) {
    const [month, , yearPart] = dateStr.split("/");
    const year = (yearPart ?? "").split(" ")[0].slice(0, 4);
    return `${year}-${(month ?? "").padStart(2, "0")}`;
  }
  return dateStr.slice(0, 7); // YYYY-MM-DD fallback
}

/**
 * Normalise a raw ShipBob lot string to the canonical YYYYMM-SUFFIX format.
 * Handles variants like "202503dp" → "202503-DP" and "202509DP" → "202509-DP".
 * Lots that are already normalised (or are bare YYYYMM digits) are returned as-is.
 */
function normalizeLot(lot: string): string {
  // If YYYYMM is immediately followed by letters (no dash), insert dash and uppercase the suffix
  return lot.replace(/^(\d{6})([A-Za-z].*)$/, (_, date, suffix) => `${date}-${suffix.toUpperCase()}`);
}

/**
 * Extract YYYY-MM-DD from a ShipBob date string.
 * ShipBob CSV uses MM/DD/YYYY format (e.g. "12/07/2024" or "12/07/2024 10:30:00 AM").
 * Falls back to YYYY-MM-DD slice for ISO-format dates.
 */
function toDateOnly(dateStr: string): string {
  if (dateStr.includes("/")) {
    const [month, day, yearPart] = dateStr.split("/");
    const year = (yearPart ?? "").split(" ")[0].slice(0, 4);
    return `${year}-${(month ?? "").padStart(2, "0")}-${(day ?? "").padStart(2, "0")}`;
  }
  return dateStr.slice(0, 10); // YYYY-MM-DD fallback
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const csvPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_CSV_PATH;

  console.log(`ShipBob CSV Import`);
  console.log(`  CSV:     ${csvPath}`);
  console.log(`  Mode:    ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log("");

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  // Column indices (0-based, from header row)
  const COL = {
    PURCHASE_DATE: 3,
    ORDER_STATUS: 9,
    LINE_ITEM_NAME: 14,
    LINE_ITEM_QTY: 15,
    LOT_NUMBER: 17,
    INGESTION_CHANNEL_STORE: 51,
  };

  // Accumulators
  const volumeMap: VolumeMap = new Map();
  const dailyMap: DailyMap = new Map();

  // Stats
  let totalRows = 0;
  let skippedChannel = 0;
  let skippedStatus = 0;
  let skippedName = 0;
  let processedRows = 0;

  const stream = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNum = 0;
  let headers: string[] = [];

  for await (const line of rl) {
    lineNum++;

    // Parse header row
    if (lineNum === 1) {
      headers = parseCsvLine(line);
      console.log(`Headers: ${headers.length} columns detected`);

      // Verify expected columns exist
      const checks: [string, number][] = [
        ["Purchase Date", COL.PURCHASE_DATE],
        ["Order Status", COL.ORDER_STATUS],
        ["Line Item Name", COL.LINE_ITEM_NAME],
        ["Line Item Qty", COL.LINE_ITEM_QTY],
        ["Lot Number", COL.LOT_NUMBER],
        ["Ingestion Channel Store", COL.INGESTION_CHANNEL_STORE],
      ];
      for (const [name, idx] of checks) {
        const actual = headers[idx] ?? "(missing)";
        if (!actual.toLowerCase().includes(name.toLowerCase().split(" ")[0])) {
          console.warn(`  Warning: Col ${idx} is "${actual}", expected "${name}"`);
        }
      }
      console.log("");
      continue;
    }

    totalRows++;

    if (totalRows % PROGRESS_INTERVAL === 0) {
      console.log(
        `  Progress: ${totalRows.toLocaleString()} rows processed ` +
          `(${volumeMap.size.toLocaleString()} volume buckets)`
      );
    }

    const fields = parseCsvLine(line);

    // --- Filters ---
    const channel = fields[COL.INGESTION_CHANNEL_STORE]?.trim() ?? "";
    if (channel === EXCLUDED_CHANNEL) {
      skippedChannel++;
      continue;
    }

    const status = fields[COL.ORDER_STATUS]?.trim() ?? "";
    if (!ALLOWED_STATUSES.has(status)) {
      skippedStatus++;
      continue;
    }

    const itemName = fields[COL.LINE_ITEM_NAME]?.trim() ?? "";
    const products = getProductsFromName(itemName);
    if (products.length === 0) {
      skippedName++;
      continue;
    }

    // --- Parse fields ---
    const purchaseDateRaw = fields[COL.PURCHASE_DATE]?.trim() ?? "";
    const qtyStr = fields[COL.LINE_ITEM_QTY]?.trim() ?? "0";
    const lotRaw = fields[COL.LOT_NUMBER]?.trim() ?? "";

    const purchaseDate = toDateOnly(purchaseDateRaw);
    const yearMonth = toYearMonth(purchaseDateRaw);
    const quantity = parseInt(qtyStr, 10) || 0;
    const lot = lotRaw ? normalizeLot(lotRaw) : null;

    // --- Accumulate volume (one entry per product — bundles contribute to two) ---
    for (const product of products) {
      const volumeKey = `${yearMonth}|${product}|${lot ?? ""}`;
      volumeMap.set(volumeKey, (volumeMap.get(volumeKey) ?? 0) + quantity);

      // Track daily breakdown
      let dayMap = dailyMap.get(volumeKey);
      if (!dayMap) {
        dayMap = new Map<string, number>();
        dailyMap.set(volumeKey, dayMap);
      }
      dayMap.set(purchaseDate, (dayMap.get(purchaseDate) ?? 0) + quantity);
    }

    processedRows++;
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log("");
  console.log("=== Import Summary ===");
  console.log(`  Total data rows:         ${totalRows.toLocaleString()}`);
  console.log(`  Skipped (channel):       ${skippedChannel.toLocaleString()}`);
  console.log(`  Skipped (status):        ${skippedStatus.toLocaleString()}`);
  console.log(`  Skipped (no name match): ${skippedName.toLocaleString()}`);
  console.log(`  Processed rows:          ${processedRows.toLocaleString()}`);
  console.log(`  Volume buckets:          ${volumeMap.size.toLocaleString()}`);
  console.log("");

  // Per-product totals
  const productTotals = new Map<string, number>();
  for (const [key, qty] of volumeMap) {
    const product = key.split("|")[1];
    productTotals.set(product, (productTotals.get(product) ?? 0) + qty);
  }
  console.log("  Units per product:");
  for (const [product, total] of [...productTotals.entries()].sort()) {
    console.log(`    ${product}: ${total.toLocaleString()}`);
  }

  // Unique lots
  const uniqueLots = new Set<string>();
  for (const key of volumeMap.keys()) {
    const lot = key.split("|")[2];
    if (lot) uniqueLots.add(lot);
  }
  console.log(`  Unique lots found:    ${uniqueLots.size}`);
  if (uniqueLots.size > 0 && uniqueLots.size <= 50) {
    console.log(`  Lots: ${[...uniqueLots].sort().join(", ")}`);
  }

  console.log("");

  if (dryRun) {
    console.log("DRY RUN complete — no data written to Firebase.");
    return;
  }

  // ---------------------------------------------------------------------------
  // Write purchase volumes (merge with existing Firebase data)
  // ---------------------------------------------------------------------------

  console.log("Loading existing purchase volumes from Firebase...");
  const existingData = await loadPurchaseVolumes();
  const existingMap = new Map<string, PurchaseVolume>();
  for (const pv of existingData.volumes) {
    const key = `${pv.yearMonth}|${pv.product}|${pv.lot ?? ""}`;
    existingMap.set(key, pv);
  }
  console.log(`  Found ${existingMap.size} existing volume records.`);

  console.log("Merging ShipBob data with existing records...");

  const volumes: PurchaseVolume[] = [];

  // Process all volume buckets found in the ShipBob CSV
  for (const [key] of volumeMap) {
    const [yearMonth, product, lotStr] = key.split("|");
    const lot = lotStr || null;
    const existing = existingMap.get(key);

    // Build dailyCounts from ShipBob data
    const shipbobDailyCounts: Record<string, number> = {};
    const dayMap = dailyMap.get(key);
    if (dayMap) {
      for (const [date, qty] of dayMap) {
        shipbobDailyCounts[date] = qty;
      }
    }

    // Merge: ShipBob daily data takes precedence for dates it covers;
    // manually entered daily data is preserved for dates ShipBob doesn't have
    const mergedDailyCounts: Record<string, number> = {
      ...(existing?.dailyCounts ?? {}),
      ...shipbobDailyCounts,
    };

    const mergedDailySum = Object.values(mergedDailyCounts).reduce((a, b) => a + b, 0);

    // purchaseCount = max(existing manual entry, sum of all daily counts)
    // This preserves any manually entered higher counts
    const purchaseCount = Math.max(existing?.purchaseCount ?? 0, mergedDailySum);

    const vol: PurchaseVolume = { yearMonth, product, lot, purchaseCount };
    if (Object.keys(mergedDailyCounts).length > 0) {
      vol.dailyCounts = mergedDailyCounts;
    }
    volumes.push(vol);

    existingMap.delete(key); // mark as handled
  }

  // Preserve existing volume records that ShipBob has no data for
  for (const pv of existingMap.values()) {
    volumes.push(pv);
  }

  console.log(`  Total volume records after merge: ${volumes.length}`);

  await savePurchaseVolumes({ volumes, lastUpdated: new Date().toISOString() });
  console.log(`  Saved ${volumes.length.toLocaleString()} volume records.`);

  console.log("");
  console.log("Import complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

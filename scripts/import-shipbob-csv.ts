#!/usr/bin/env tsx
/**
 * Import ShipBob CSV export into Firebase.
 *
 * Writes to:
 *   purchase-volumes/current  — aggregated units per yearMonth × product × lot
 *   shipbob-orders/{id}       — per-order records for lot-matching against claims
 *
 * Usage:
 *   npx tsx scripts/import-shipbob-csv.ts [--dry-run] [path/to/file.csv]
 *
 * Default CSV path: ~/Downloads/OrdersExport_20260302_f7e513d0.csv
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { writeBatch, doc } from "firebase/firestore";
import { db, savePurchaseVolumes } from "../lib/firebase";
import { PurchaseVolume } from "../lib/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CSV_PATH = path.join(
  process.env.HOME ?? "~",
  "Downloads",
  "OrdersExport_20260302_f7e513d0.csv"
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

// Firestore collection for per-order records
const SHIPBOB_ORDERS_COLLECTION = "shipbob-orders";

// Batch size for Firestore writes (max 500)
const BATCH_SIZE = 400;

// Progress logging interval
const PROGRESS_INTERVAL = 50_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShipBobLineItem {
  sku: string;
  product: string;
  quantity: number;
  lot: string | null;
}

interface ShipBobOrder {
  storeOrderId: string;       // normalized "#US2xxx"
  rawStoreOrderId: string;    // original from CSV
  purchaseDate: string;       // "YYYY-MM-DD"
  yearMonth: string;          // "YYYY-MM"
  channel: string;
  lineItems: ShipBobLineItem[];
  _importedAt: string;
}

// Key: "yearMonth|product|lot" (lot="" for null)
type VolumeMap = Map<string, number>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a ShipBob Store Order ID to Shopify's "#US2xxx" format.
 *
 * Patterns observed in CSV:
 *   645067        → #US2645067   (bare number)
 *   #66491        → #US266491    (# prefix, no US2)
 *   #US21402515   → #US21402515  (already correct)
 */
function normalizeOrderId(raw: string): string {
  if (raw.startsWith("#US2")) return raw;
  // Strip leading # and optional US/US2 prefix, then prepend #US2
  const digits = raw.replace(/^#(US2?)?/, "");
  return "#US2" + digits;
}

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
    STORE_ORDER_ID: 1,
    PURCHASE_DATE: 3,
    ORDER_STATUS: 9,
    LINE_ITEM_NAME: 14,
    LINE_ITEM_QTY: 15,
    LOT_NUMBER: 17,
    SKU: 48,
    INGESTION_CHANNEL_STORE: 51,
  };

  // Accumulators
  const volumeMap: VolumeMap = new Map();
  const ordersMap = new Map<string, ShipBobOrder>();

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
        ["Store Order ID", COL.STORE_ORDER_ID],
        ["Purchase Date", COL.PURCHASE_DATE],
        ["Order Status", COL.ORDER_STATUS],
        ["Line Item Name", COL.LINE_ITEM_NAME],
        ["Line Item Qty", COL.LINE_ITEM_QTY],
        ["Lot Number", COL.LOT_NUMBER],
        ["SKU", COL.SKU],
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
          `(${ordersMap.size.toLocaleString()} orders, ${volumeMap.size.toLocaleString()} volume buckets)`
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
    const rawOrderId = fields[COL.STORE_ORDER_ID]?.trim() ?? "";
    const purchaseDateRaw = fields[COL.PURCHASE_DATE]?.trim() ?? "";
    const qtyStr = fields[COL.LINE_ITEM_QTY]?.trim() ?? "0";
    const lotRaw = fields[COL.LOT_NUMBER]?.trim() ?? "";
    const sku = fields[COL.SKU]?.trim() ?? "";

    const purchaseDate = toDateOnly(purchaseDateRaw);
    const yearMonth = toYearMonth(purchaseDateRaw);
    const quantity = parseInt(qtyStr, 10) || 0;
    const lot = lotRaw || null;
    const normalizedOrderId = normalizeOrderId(rawOrderId);

    // --- Accumulate volume (one entry per product — bundles contribute to two) ---
    for (const product of products) {
      const volumeKey = `${yearMonth}|${product}|${lot ?? ""}`;
      volumeMap.set(volumeKey, (volumeMap.get(volumeKey) ?? 0) + quantity);
    }

    // --- Accumulate order ---
    let order = ordersMap.get(normalizedOrderId);
    if (!order) {
      order = {
        storeOrderId: normalizedOrderId,
        rawStoreOrderId: rawOrderId,
        purchaseDate,
        yearMonth,
        channel,
        lineItems: [],
        _importedAt: new Date().toISOString(),
      };
      ordersMap.set(normalizedOrderId, order);
    }

    // Add or merge line item per product (bundles produce two line item entries)
    for (const product of products) {
      const existingItem = order.lineItems.find(
        (li) => li.sku === sku && li.product === product && li.lot === lot
      );
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        order.lineItems.push({ sku, product, quantity, lot });
      }
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
  console.log(`  Unique orders:        ${ordersMap.size.toLocaleString()}`);
  console.log(`  Volume buckets:       ${volumeMap.size.toLocaleString()}`);
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
  // Write purchase volumes
  // ---------------------------------------------------------------------------

  console.log("Writing purchase volumes to Firebase...");

  const volumes: PurchaseVolume[] = [];
  for (const [key, purchaseCount] of volumeMap) {
    const [yearMonth, product, lotStr] = key.split("|");
    volumes.push({
      yearMonth,
      product,
      lot: lotStr || null,
      purchaseCount,
    });
  }

  await savePurchaseVolumes({ volumes, lastUpdated: new Date().toISOString() });
  console.log(`  Saved ${volumes.length.toLocaleString()} volume records.`);

  // ---------------------------------------------------------------------------
  // Write shipbob-orders
  // ---------------------------------------------------------------------------

  console.log(`Writing ${ordersMap.size.toLocaleString()} orders to Firebase...`);

  const orders = [...ordersMap.values()];
  let ordersSaved = 0;

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = orders.slice(i, i + BATCH_SIZE);

    for (const order of chunk) {
      const docRef = doc(db, SHIPBOB_ORDERS_COLLECTION, order.storeOrderId);
      batch.set(docRef, order, { merge: true });
    }

    await batch.commit();
    ordersSaved += chunk.length;

    if (ordersSaved % (BATCH_SIZE * 5) === 0 || ordersSaved === orders.length) {
      console.log(`  Orders saved: ${ordersSaved.toLocaleString()} / ${orders.length.toLocaleString()}`);
    }
  }

  console.log("");
  console.log("Import complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

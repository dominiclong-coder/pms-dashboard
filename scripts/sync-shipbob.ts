/**
 * ShipBob Order Sync
 *
 * Streams ShipBob orders page-by-page (no full load into memory), applies
 * filters, slims each order to only the fields needed, and uploads to Firebase.
 *
 * Usage:
 *   SHIPBOB_TOKEN=your_token npx tsx scripts/sync-shipbob.ts
 *
 * Options:
 *   --list-channels   Scan first 10 pages, print all unique channel names, exit
 *   --debug           Print raw JSON of first 2 orders and exit
 *   --dry-run         Fetch and filter without writing to Firebase
 *   --from=YYYY-MM    Override start date (default: 2023-01)
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";

// ─────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────

const INCLUDED_STATUSES  = new Set(["Fulfilled", "Completed"]); // order.status
const INCLUDED_ORDER_TYPES = new Set(["DTC"]);                   // order.type
const INCLUDED_COUNTRIES = new Set(["US"]);                      // order.recipient.address.country

// ⚠️  Run --list-channels first to discover all channel names, then enable:
// const INCLUDED_CHANNELS = new Set([
//   "dentalpodusa",  // confirmed from --debug
//   // add remaining Shopify store names here
// ]);

const DEFAULT_START_DATE = "2023-01-01";

// ─────────────────────────────────────────────
// Firebase Config
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCsq18Lx-RaMf9eWproxaKGiMd-fkIdOPY",
  authDomain: "pms-dashboard-62bc7.firebaseapp.com",
  projectId: "pms-dashboard-62bc7",
  storageBucket: "pms-dashboard-62bc7.firebasestorage.app",
  messagingSenderId: "1065957058566",
  appId: "1:1065957058566:web:6db647024140fc196ebb87",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const COLLECTIONS = {
  ORDERS: "shipbob-orders",
  METADATA: "metadata",
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawOrder = Record<string, any> & { id: number };

interface SlimProduct {
  sku: string;
  name: string;
  quantity: number;
  lot: string | null;
}

interface SlimOrder {
  id: number;
  order_number: string;
  reference_id: string;
  purchase_date: string;
  channel_name: string;
  products: SlimProduct[];
  _synced_at: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function passesFilter(order: RawOrder, startDate: string): boolean {
  const purchaseDate: string = order.purchase_date ?? "";
  if (!purchaseDate || purchaseDate < startDate) return false;
  if (!INCLUDED_STATUSES.has(order.status ?? "")) return false;
  if (!INCLUDED_ORDER_TYPES.has(order.type ?? "")) return false;
  if (!INCLUDED_COUNTRIES.has(order.recipient?.address?.country ?? "")) return false;
  // Uncomment once channel names are confirmed via --list-channels:
  // if (!INCLUDED_CHANNELS.has(order.channel?.name ?? "")) return false;
  return true;
}

function slimOrder(order: RawOrder, syncedAt: string): SlimOrder {
  // Product names and lot numbers live in shipments[].products[], not order.products[]
  const products: SlimProduct[] = [];

  for (const shipment of order.shipments ?? []) {
    for (const product of shipment.products ?? []) {
      const inventoryItem = product.inventory_items?.[0];
      products.push({
        sku: product.sku ?? "",
        name: product.name ?? "",
        quantity: inventoryItem?.quantity ?? 1,
        lot: inventoryItem?.lot ?? null,
      });
    }
  }

  return {
    id: order.id,
    order_number: String(order.order_number ?? ""),
    reference_id: String(order.reference_id ?? ""),
    purchase_date: order.purchase_date ?? "",
    channel_name: order.channel?.name ?? "",
    products,
    _synced_at: syncedAt,
  };
}

// ─────────────────────────────────────────────
// ShipBob API
// ─────────────────────────────────────────────
async function fetchOrdersPage(
  token: string,
  page: number,
  limit: number,
  maxRetries: number = 5
): Promise<{ data: RawOrder[]; hasMore: boolean }> {
  const url = `https://api.shipbob.com/1.0/order?page=${page}&limit=${limit}&SortOrder=Oldest`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  Rate limited, waiting ${delay / 1000}s before retry ${attempt}/${maxRetries}...`);
      await sleep(delay);
    }

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 429) {
        console.log(`  Rate limited (429) on page ${page}`);
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API Response Body: ${errorBody}`);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // ShipBob returns the array directly (not wrapped in { data: [] })
      const data: RawOrder[] = await response.json();
      const orders = Array.isArray(data) ? data : [];

      return { data: orders, hasMore: orders.length === limit };
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`  Request failed, retrying...`);
    }
  }

  throw new Error("Max retries exceeded");
}

// ─────────────────────────────────────────────
// Streaming sync — fetch → filter → slim → upload per page
// ─────────────────────────────────────────────
async function syncOrders(
  token: string,
  startDate: string,
  dryRun: boolean
): Promise<number> {
  const syncedAt = new Date().toISOString();
  const seenIds = new Set<number>();
  const BATCH_SIZE = 400;
  let page = 1;
  const limit = 250;
  let totalUploaded = 0;
  let totalFiltered = 0;

  console.log(`\nSyncing ShipBob orders (from ${startDate})...`);

  while (true) {
    console.log(`  Page ${page}...`);

    const { data, hasMore } = await fetchOrdersPage(token, page, limit);

    // Filter and slim this page
    const slim: SlimOrder[] = [];
    for (const order of data) {
      if (seenIds.has(order.id)) continue;
      seenIds.add(order.id);

      if (!passesFilter(order, startDate)) continue;
      slim.push(slimOrder(order, syncedAt));
    }

    totalFiltered += slim.length;
    console.log(`  Got ${data.length} orders, ${slim.length} passed filters (running total: ${totalFiltered})`);

    // Write this page's batch to Firebase
    if (slim.length > 0 && !dryRun) {
      for (let i = 0; i < slim.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = slim.slice(i, i + BATCH_SIZE);

        for (const order of chunk) {
          const docRef = doc(db, COLLECTIONS.ORDERS, String(order.id));
          batch.set(docRef, order, { merge: true });
        }

        await batch.commit();
        totalUploaded += chunk.length;
        process.stdout.write(`\r  Uploaded: ${totalUploaded}`);
      }
      await sleep(500); // small delay between batches
    }

    if (!hasMore) {
      console.log(`\n  No more pages, stopping.`);
      break;
    }

    page++;
    await sleep(2000); // 2s delay between pages to avoid rate limiting

    if (page > 2000) {
      console.log(`\n  Reached page limit (2000), stopping.`);
      break;
    }
  }

  return dryRun ? totalFiltered : totalUploaded;
}

// ─────────────────────────────────────────────
// --list-channels: discover all channel names
// ─────────────────────────────────────────────
async function listChannels(token: string): Promise<void> {
  console.log("\nScanning first 10 pages for unique channel names...\n");
  const channelCounts = new Map<string, number>();

  for (let page = 1; page <= 10; page++) {
    const { data, hasMore } = await fetchOrdersPage(token, page, 250);
    for (const order of data) {
      const name = order.channel?.name ?? "(unknown)";
      channelCounts.set(name, (channelCounts.get(name) ?? 0) + 1);
    }
    console.log(`  Page ${page}: ${data.length} orders`);
    if (!hasMore) break;
    await sleep(2000);
  }

  console.log("\n── Channel names found ──");
  const sorted = [...channelCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    console.log(`  "${name}": ${count} orders`);
  }
  console.log("\nAdd your Shopify channel names to INCLUDED_CHANNELS in the script, then enable the filter.");
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  const token = process.env.SHIPBOB_TOKEN;
  if (!token) {
    console.error("ERROR: SHIPBOB_TOKEN environment variable is required");
    console.error("  Add SHIPBOB_TOKEN=your_token to .env.local, then run:");
    console.error("  source .env.local && npx tsx scripts/sync-shipbob.ts");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const isListChannels = args.includes("--list-channels");
  const isDebug        = args.includes("--debug");
  const isDryRun       = args.includes("--dry-run");
  const fromArg        = args.find((a) => a.startsWith("--from="));
  const startDate      = fromArg ? `${fromArg.replace("--from=", "")}-01` : DEFAULT_START_DATE;

  console.log("========================================");
  console.log("ShipBob Order Sync");
  console.log("========================================");
  console.log(`  Started at:  ${new Date().toISOString()}`);
  console.log(`  Start date:  ${startDate}`);
  if (isDebug)        console.log("  Mode: DEBUG");
  if (isDryRun)       console.log("  Mode: DRY RUN (no Firebase writes)");
  if (isListChannels) console.log("  Mode: LIST CHANNELS");

  // --debug: print first 2 raw orders and exit
  if (isDebug) {
    console.log("\nFetching page 1 to inspect raw order structure...");
    const { data } = await fetchOrdersPage(token, 1, 2);
    for (let i = 0; i < Math.min(2, data.length); i++) {
      console.log(`\n--- Order ${i + 1} ---`);
      console.log(JSON.stringify(data[i], null, 2));
    }
    process.exit(0);
  }

  // --list-channels: print all unique channel names and exit
  if (isListChannels) {
    await listChannels(token);
    process.exit(0);
  }

  // Main sync
  const count = await syncOrders(token, startDate, isDryRun);

  if (!isDryRun) {
    await setDoc(doc(db, COLLECTIONS.METADATA, "shipbobLastUpdate"), {
      lastUpdated: new Date().toISOString(),
      orderCount: count,
      startDate,
    });
    console.log("  ✓ Metadata updated");
  }

  console.log("\n========================================");
  if (isDryRun) {
    console.log(`DRY RUN complete. ${count} orders would be uploaded.`);
  } else {
    console.log(`Sync complete! ${count} orders uploaded.`);
    console.log(`Collection: ${COLLECTIONS.ORDERS}`);
  }
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nERROR: Sync failed:", error);
    process.exit(1);
  });

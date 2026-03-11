import { loadFromFirebase } from "../lib/firebase";
import { calculateExposureDays, isValidExposure, calculateCohortSurvival } from "../lib/analytics";
import { loadPurchaseVolumes } from "../lib/firebase";

async function main() {
  const [{ warrantyRegistrations }, { volumes: purchaseVolumes }] = await Promise.all([
    loadFromFirebase(),
    loadPurchaseVolumes(),
  ]);

  const total = warrantyRegistrations.length;
  const hasShopify = warrantyRegistrations.filter(r => r.shopifyOrderCreatedAt).length;
  const hasPurchaseDate = warrantyRegistrations.filter(r => r.purchaseDate).length;

  console.log("Total warranty claims in Firebase:", total);
  console.log("With shopifyOrderCreatedAt:", hasShopify, `(${(hasShopify/total*100).toFixed(1)}%)`);
  console.log("With purchaseDate:", hasPurchaseDate, `(${(hasPurchaseDate/total*100).toFixed(1)}%)`);

  // --- Dental Pod Go breakdown ---
  const go = warrantyRegistrations.filter(r => r.productName?.toLowerCase().includes("dental pod go"));
  console.log("\n=== Dental Pod Go ===");
  console.log("Total:", go.length);

  const goWithShopify = go.filter(r => r.shopifyOrderCreatedAt && r.createdAt);
  const goValidExposure = goWithShopify.filter(r => {
    const days = calculateExposureDays(r.shopifyOrderCreatedAt!, r.createdAt!);
    return isValidExposure(days, "warranty");
  });
  console.log("With shopifyOrderCreatedAt + createdAt:", goWithShopify.length);
  console.log("With shopifyOrderCreatedAt + valid exposure (0-365d):", goValidExposure.length);

  const shopifyChannels = ["Shop App", "Zima Dental Website", "Zima Dental Website or Shop App"];
  const goSurvival = goValidExposure.filter(r => {
    const ch = r.fieldData?.["where-did-you-purchase-this-product-from-"] as string;
    return ch && shopifyChannels.includes(ch);
  });
  console.log("Survival-eligible (shopify channel):", goSurvival.length);

  // Purchase channel breakdown
  const channels: Record<string, number> = {};
  for (const r of goValidExposure) {
    const ch = (r.fieldData?.["where-did-you-purchase-this-product-from-"] as string) || "(none)";
    channels[ch] = (channels[ch] || 0) + 1;
  }
  console.log("\nPurchase channels (valid-exposure claims):");
  for (const [ch, count] of Object.entries(channels).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ch}: ${count}`);
  }

  // Product name variants
  const names: Record<string, number> = {};
  for (const r of go) {
    const n = r.productName || "(none)";
    names[n] = (names[n] || 0) + 1;
  }
  console.log("\nProduct name variants:");
  for (const [n, count] of Object.entries(names).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${n}": ${count}`);
  }

  // --- Global colour scale check ---
  console.log("\n=== Global Colour Scale ===");
  const { filterByValidExposure } = await import("../lib/analytics");
  const validRegs = filterByValidExposure(warrantyRegistrations, "warranty");
  const allData = calculateCohortSurvival(validRegs, purchaseVolumes, "All Products", "2023-01", "2026-02", "warranty", undefined);

  let rawMin = Infinity, rawMax = -Infinity;
  let clampedMin = 100, clampedMax = 0;
  const negativeRows: { cohort: string; months: number; rate: number; claims: number; volume: number }[] = [];

  for (const p of allData) {
    if (p.purchaseVolume > 0) {
      rawMin = Math.min(rawMin, p.survivalRate);
      rawMax = Math.max(rawMax, p.survivalRate);
      const clamped = Math.max(0, Math.min(100, p.survivalRate));
      clampedMin = Math.min(clampedMin, clamped);
      clampedMax = Math.max(clampedMax, clamped);
      if (p.survivalRate < 0) {
        negativeRows.push({ cohort: p.cohortMonth, months: p.monthsSincePurchase, rate: p.survivalRate, claims: p.claimCount, volume: p.purchaseVolume });
      }
    }
  }

  console.log(`Raw min: ${rawMin.toFixed(1)}%,  Raw max: ${rawMax.toFixed(1)}%`);
  console.log(`Clamped min (colour scale): ${clampedMin.toFixed(1)}%,  Clamped max: ${clampedMax.toFixed(1)}%`);
  console.log(`Negative survival rate cells: ${negativeRows.length}`);
  if (negativeRows.length > 0) {
    console.log("Top 10 worst (most negative):");
    negativeRows.sort((a, b) => a.rate - b.rate).slice(0, 10).forEach(r => {
      console.log(`  ${r.cohort} month+${r.months}: ${r.rate.toFixed(1)}%  (${r.claims} claims / ${r.volume} units)`);
    });
  }
}

main();

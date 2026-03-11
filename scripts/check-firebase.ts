import { loadFromFirebase } from "../lib/firebase";
import { calculateExposureDays, isValidExposure, calculateCohortSurvival } from "../lib/analytics";
import { loadPurchaseVolumes } from "../lib/firebase";

async function main() {
  const [{ warrantyRegistrations }, { volumes: purchaseVolumes }] = await Promise.all([
    loadFromFirebase(),
    loadPurchaseVolumes(),
  ]);

  // ─── Form change verification: 5 March 2026 ───────────────────────────────
  const CUTOFF = "2026-03-05";
  const before = warrantyRegistrations.filter(r => r.createdAt && r.createdAt < CUTOFF);
  const after  = warrantyRegistrations.filter(r => r.createdAt && r.createdAt >= CUTOFF);

  const countHasProductName = (regs: typeof warrantyRegistrations) =>
    regs.filter(r => r.productName && r.productName.trim() !== "").length;
  const countHasFieldProductName = (regs: typeof warrantyRegistrations) =>
    regs.filter(r => {
      const v = r.fieldData?.["product-Name"] as string | undefined;
      return v && v.trim() !== "";
    }).length;
  const countHasBoth = (regs: typeof warrantyRegistrations) =>
    regs.filter(r => {
      const fn = r.productName && r.productName.trim() !== "";
      const fd = (r.fieldData?.["product-Name"] as string | undefined)?.trim() !== "" && r.fieldData?.["product-Name"];
      return fn && fd;
    }).length;
  const countHasNeither = (regs: typeof warrantyRegistrations) =>
    regs.filter(r => {
      const fn = r.productName && r.productName.trim() !== "";
      const fd = (r.fieldData?.["product-Name"] as string | undefined)?.trim() !== "" && r.fieldData?.["product-Name"];
      return !fn && !fd;
    }).length;

  console.log("=== Form Change Verification: productName vs fieldData['product-Name'] ===");
  console.log(`Cutoff date: ${CUTOFF}`);
  console.log(`\nBEFORE ${CUTOFF} (${before.length} claims):`);
  console.log(`  productName populated:              ${countHasProductName(before)} / ${before.length}`);
  console.log(`  fieldData["product-Name"] populated: ${countHasFieldProductName(before)} / ${before.length}`);
  console.log(`  Both populated:                      ${countHasBoth(before)}`);
  console.log(`  Neither populated:                   ${countHasNeither(before)}`);

  console.log(`\nON/AFTER ${CUTOFF} (${after.length} claims):`);
  console.log(`  productName populated:              ${countHasProductName(after)} / ${after.length}`);
  console.log(`  fieldData["product-Name"] populated: ${countHasFieldProductName(after)} / ${after.length}`);
  console.log(`  Both populated:                      ${countHasBoth(after)}`);
  console.log(`  Neither populated:                   ${countHasNeither(after)}`);

  // Show sample records from after the cutoff
  if (after.length > 0) {
    console.log(`\nSample records ON/AFTER ${CUTOFF} (up to 5):`);
    after.slice(0, 5).forEach((r, i) => {
      const fdProd = r.fieldData?.["product-Name"] as string | undefined;
      console.log(`  [${i+1}] createdAt: ${r.createdAt}`);
      console.log(`        productName:              "${r.productName ?? ""}"`);
      console.log(`        fieldData["product-Name"]: "${fdProd ?? ""}"`);
    });
  }

  // Show all fieldData keys present in after-cutoff records
  const allFdKeys: Record<string, number> = {};
  for (const r of after) {
    for (const key of Object.keys(r.fieldData ?? {})) {
      allFdKeys[key] = (allFdKeys[key] || 0) + 1;
    }
  }
  console.log(`\nAll fieldData keys present ON/AFTER ${CUTOFF} (across ${after.length} records):`);
  for (const [key, count] of Object.entries(allFdKeys).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${key}": ${count} records`);
  }

  // Show all fieldData keys present BEFORE cutoff for comparison
  const beforeFdKeys: Record<string, number> = {};
  for (const r of before.slice(0, 500)) { // Sample 500 for speed
    for (const key of Object.keys(r.fieldData ?? {})) {
      beforeFdKeys[key] = (beforeFdKeys[key] || 0) + 1;
    }
  }
  console.log(`\nFieldData keys in BEFORE ${CUTOFF} sample (first 500 records):`);
  for (const [key, count] of Object.entries(beforeFdKeys).sort((a, b) => b[1] - a[1])) {
    console.log(`  "${key}": ${count} records`);
  }

  // Show full fieldData for first 3 after-cutoff records
  console.log(`\nFull fieldData for first 3 records ON/AFTER ${CUTOFF}:`);
  after.slice(0, 3).forEach((r, i) => {
    console.log(`  [${i+1}] createdAt: ${r.createdAt}`);
    console.log(`        fieldData:`, JSON.stringify(r.fieldData, null, 6));
  });
  // ──────────────────────────────────────────────────────────────────────────

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

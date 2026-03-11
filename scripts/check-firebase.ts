import { loadFromFirebase } from "../lib/firebase";
import { calculateExposureDays, isValidExposure } from "../lib/analytics";

async function main() {
  const { warrantyRegistrations } = await loadFromFirebase();

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
}

main();

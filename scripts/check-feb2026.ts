import { loadFromFirebase } from "../lib/firebase";
import { calculateExposureDays, isValidExposure, extractProductType } from "../lib/analytics";
import { getProductName } from "../lib/analytics";

function getPeriodKeyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let months = (end.getFullYear() - start.getFullYear()) * 12;
  months += end.getMonth() - start.getMonth();
  if (end.getDate() < start.getDate()) months--;
  return Math.max(0, months);
}

async function main() {
  const { warrantyRegistrations } = await loadFromFirebase();
  const validChannels = ["Shop App", "Zima Dental Website", "Zima Dental Website or Shop App"];
  const trackedProducts = ["Dental Pod", "Dental Pod Go", "Dental Pod Pro", "Zima Go/Zima UV Case"];

  // Step 1: purchased in Feb 2026 (local time)
  const step1 = warrantyRegistrations.filter(reg =>
    reg.shopifyOrderCreatedAt && reg.createdAt &&
    getPeriodKeyLocal(new Date(reg.shopifyOrderCreatedAt)) === "2026-02"
  );
  const step1m0 = step1.filter(reg => monthsBetween(reg.shopifyOrderCreatedAt!, reg.createdAt!) === 0);
  console.log(`Step 1 - Feb 2026 cohort (no other filters): ${step1.length}, month 0: ${step1m0.length}`);

  // Step 2: + valid exposure
  const step2 = step1.filter(reg => {
    const exp = calculateExposureDays(reg.shopifyOrderCreatedAt!, reg.createdAt!);
    return isValidExposure(exp, "warranty");
  });
  const step2m0 = step2.filter(reg => monthsBetween(reg.shopifyOrderCreatedAt!, reg.createdAt!) === 0);
  console.log(`Step 2 - + valid exposure: ${step2.length}, month 0: ${step2m0.length}`);

  // Step 3: + channel filter
  const step3 = step2.filter(reg => {
    const ch = reg.fieldData?.["where-did-you-purchase-this-product-from-"] as string | undefined;
    return ch && validChannels.includes(ch);
  });
  const step3m0 = step3.filter(reg => monthsBetween(reg.shopifyOrderCreatedAt!, reg.createdAt!) === 0);
  console.log(`Step 3 - + channel filter: ${step3.length}, month 0: ${step3m0.length}`);

  // Step 4: + tracked product filter
  const step4 = step3.filter(reg => {
    const pt = extractProductType(getProductName(reg));
    return trackedProducts.includes(pt);
  });
  const step4m0 = step4.filter(reg => monthsBetween(reg.shopifyOrderCreatedAt!, reg.createdAt!) === 0);
  console.log(`Step 4 - + tracked products: ${step4.length}, month 0: ${step4m0.length}`);

  // What products are being excluded in step 4?
  const excluded = step3m0.filter(reg => {
    const pt = extractProductType(getProductName(reg));
    return !trackedProducts.includes(pt);
  });
  const excludedTypes: Record<string, number> = {};
  for (const reg of excluded) {
    const pt = extractProductType(getProductName(reg)) || `[raw: ${getProductName(reg) || "none"}]`;
    excludedTypes[pt] = (excludedTypes[pt] || 0) + 1;
  }
  if (Object.keys(excludedTypes).length > 0) {
    console.log("\nExcluded by product filter (month 0):");
    for (const [p, n] of Object.entries(excludedTypes).sort((a,b) => b[1]-a[1])) console.log(`  ${p}: ${n}`);
  }
}

main().catch(console.error);

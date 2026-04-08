import { loadFromFirebase } from "../lib/firebase";
import { calculateExposureDays, isValidExposure, extractProductType } from "../lib/analytics";
import { getProductName, getProductType } from "../lib/analytics";

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
  const { returnRegistrations } = await loadFromFirebase();

  console.log(`\nTotal return registrations: ${returnRegistrations.length}`);

  // Mar 2026 cohort, Dental Pod, return claims
  const cohort = returnRegistrations.filter(reg => {
    if (!reg.shopifyOrderCreatedAt || !reg.createdAt) return false;
    if (getPeriodKeyLocal(new Date(reg.shopifyOrderCreatedAt)) !== "2026-03") return false;
    const exposureDays = calculateExposureDays(reg.shopifyOrderCreatedAt, reg.createdAt);
    if (!isValidExposure(exposureDays, "return")) return false;
    return getProductType(reg) === "Dental Pod";
  });

  console.log(`\nMar 2026 cohort - Dental Pod return claims (valid exposure): ${cohort.length}`);

  // Break down by month
  for (let m = 0; m <= 1; m++) {
    const count = cohort.filter(reg => monthsBetween(reg.shopifyOrderCreatedAt!, reg.createdAt!) === m).length;
    console.log(`  Month ${m}: ${count}`);
  }

  // How was product identified?
  let viaSerial = 0, viaName = 0;
  for (const reg of cohort) {
    const sn = reg.serialNumbers?.[0]?.trim();
    if (sn) viaSerial++;
    else viaName++;
  }
  console.log(`\nProduct identified via: serial=${viaSerial}, name fallback=${viaName}`);
}

main().catch(console.error);

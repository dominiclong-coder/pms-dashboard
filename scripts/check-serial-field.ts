import { loadFromFirebase } from "../lib/firebase";

async function main() {
  const { warrantyRegistrations } = await loadFromFirebase();

  // Sample 10 records that have serialNumbers populated
  const withSerial = warrantyRegistrations.filter(r => r.serialNumbers && r.serialNumbers.length > 0);
  console.log(`\nRecords with serialNumbers: ${withSerial.length} / ${warrantyRegistrations.length}`);
  console.log("\nSample values:");
  withSerial.slice(0, 15).forEach(r => {
    console.log(`  ${JSON.stringify(r.serialNumbers)} | productName: ${r.productName || r.fieldData?.["product-name"] || "(blank)"}`);
  });

  // Check if fieldData has any serial-number-like fields
  const fieldDataKeys = new Set<string>();
  warrantyRegistrations.slice(0, 500).forEach(r => {
    if (r.fieldData) Object.keys(r.fieldData).forEach(k => fieldDataKeys.add(k));
  });
  const serialLikeKeys = [...fieldDataKeys].filter(k => k.toLowerCase().includes("serial") || k.toLowerCase().includes("lot") || k.toLowerCase().includes("sn"));
  console.log("\nFieldData keys with 'serial', 'lot', or 'sn':", serialLikeKeys);
}

main().catch(console.error);

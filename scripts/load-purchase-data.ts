/**
 * One-time script to load purchase volume data into Firebase
 *
 * Usage: npx tsx scripts/load-purchase-data.ts
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCsq18Lx-RaMf9eWproxaKGiMd-fkIdOPY",
  authDomain: "pms-dashboard-62bc7.firebaseapp.com",
  projectId: "pms-dashboard-62bc7",
  storageBucket: "pms-dashboard-62bc7.firebasestorage.app",
  messagingSenderId: "1065957058566",
  appId: "1:1065957058566:web:6db647024140fc196ebb87"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Purchase data for Dental Pod
const dentalPodData = {
  "2023-03": 10578,
  "2023-04": 10384,
  "2023-05": 9550,
  "2023-06": 12744,
  "2023-07": 14144,
  "2023-08": 14671,
  "2023-09": 11243,
  "2023-10": 9651,
  "2023-11": 19841,
  "2023-12": 23640,
  "2024-01": 18004,
  "2024-02": 15692,
  "2024-03": 15656,
  "2024-04": 13748,
  "2024-05": 10667,
  "2024-06": 12080,
  "2024-07": 14643,
  "2024-08": 13251,
  "2024-09": 16927,
  "2024-10": 13767,
  "2024-11": 25820,
  "2024-12": 30771,
  "2025-01": 13907,
  "2025-02": 11076,
  "2025-03": 11809,
  "2025-04": 8237,
  "2025-05": 7165,
  "2025-06": 8364,
  "2025-07": 9886,
  "2025-08": 10379,
  "2025-09": 8551,
  "2025-10": 8356,
  "2025-11": 30720,
  "2025-12": 30476,
  "2026-01": 11305,
};

// Purchase data for Dental Pod Pro
const dentalPodProData = {
  "2023-03": 0,
  "2023-04": 0,
  "2023-05": 0,
  "2023-06": 0,
  "2023-07": 0,
  "2023-08": 0,
  "2023-09": 0,
  "2023-10": 0,
  "2023-11": 0,
  "2023-12": 0,
  "2024-01": 0,
  "2024-02": 0,
  "2024-03": 0,
  "2024-04": 0,
  "2024-05": 0,
  "2024-06": 0,
  "2024-07": 0,
  "2024-08": 0,
  "2024-09": 1080,
  "2024-10": 4941,
  "2024-11": 12959,
  "2024-12": 12997,
  "2025-01": 7464,
  "2025-02": 6254,
  "2025-03": 7194,
  "2025-04": 5123,
  "2025-05": 5631,
  "2025-06": 5390,
  "2025-07": 6315,
  "2025-08": 5663,
  "2025-09": 4961,
  "2025-10": 5343,
  "2025-11": 15412,
  "2025-12": 14334,
  "2026-01": 7875,
};

// Purchase data for Zima Go/Zima UV Case/Zima Case Air
const zimaData = {
  "2023-03": 17,
  "2023-04": 16,
  "2023-05": 24,
  "2023-06": 34,
  "2023-07": 1541,
  "2023-08": 1254,
  "2023-09": 1025,
  "2023-10": 771,
  "2023-11": 1282,
  "2023-12": 830,
  "2024-01": 792,
  "2024-02": 858,
  "2024-03": 1044,
  "2024-04": 1574,
  "2024-05": 1173,
  "2024-06": 1280,
  "2024-07": 2654,
  "2024-08": 2586,
  "2024-09": 2439,
  "2024-10": 2417,
  "2024-11": 5347,
  "2024-12": 4111,
  "2025-01": 2387,
  "2025-02": 2956,
  "2025-03": 4239,
  "2025-04": 2854,
  "2025-05": 3112,
  "2025-06": 3174,
  "2025-07": 4021,
  "2025-08": 3459,
  "2025-09": 3380,
  "2025-10": 2801,
  "2025-11": 7616,
  "2025-12": 5499,
  "2026-01": 3061,
};

async function loadPurchaseVolumes() {
  console.log("Loading purchase volume data into Firebase...\n");

  const volumes = [];

  // Load Dental Pod purchase data
  console.log("Dental Pod:");
  for (const [yearMonth, count] of Object.entries(dentalPodData)) {
    volumes.push({
      yearMonth,
      product: "Dental Pod",
      purchaseCount: count,
    });
    console.log(`  ${yearMonth}: ${count.toLocaleString()} units`);
  }

  // Load Dental Pod Pro purchase data
  console.log("\nDental Pod Pro:");
  for (const [yearMonth, count] of Object.entries(dentalPodProData)) {
    if (count > 0) { // Only add non-zero entries
      volumes.push({
        yearMonth,
        product: "Dental Pod Pro",
        purchaseCount: count,
      });
      console.log(`  ${yearMonth}: ${count.toLocaleString()} units`);
    }
  }

  // Load Zima purchase data
  console.log("\nZima Go/Zima UV Case/Zima Case Air:");
  for (const [yearMonth, count] of Object.entries(zimaData)) {
    volumes.push({
      yearMonth,
      product: "Zima Go/Zima UV Case/Zima Case Air",
      purchaseCount: count,
    });
    console.log(`  ${yearMonth}: ${count.toLocaleString()} units`);
  }

  // Save to Firebase
  const docRef = doc(db, "purchase-volumes", "current");
  await setDoc(docRef, {
    volumes,
    lastUpdated: new Date().toISOString(),
  });

  console.log(`\n✓ Successfully loaded ${volumes.length} data points to Firebase`);
  console.log("\nProducts loaded: Dental Pod, Dental Pod Pro, Zima Go/Zima UV Case/Zima Case Air");
  console.log("You can add Dental Pod Go data through the dashboard UI.");
}

loadPurchaseVolumes()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

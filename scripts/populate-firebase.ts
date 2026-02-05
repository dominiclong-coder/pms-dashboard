/**
 * One-time script to populate Firebase with existing JSON data
 *
 * Usage:
 *   npx tsx scripts/populate-firebase.ts          # Upload all
 *   npx tsx scripts/populate-firebase.ts warranty  # Upload warranty only
 *   npx tsx scripts/populate-firebase.ts return    # Upload return only
 *
 * Note: Firebase free tier has 20k writes/day limit.
 * Warranty claims: ~19k records
 * Return claims: ~2.3k records
 *
 * If you hit quota limits, wait 24 hours and run for the remaining type.
 */

import * as fs from "fs";
import * as path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";

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

const COLLECTIONS = {
  WARRANTY: "warranty-claims",
  RETURN: "return-claims",
  METADATA: "metadata"
};

interface Registration {
  id: string | number;
  [key: string]: unknown;
}

interface StaticData {
  warrantyRegistrations: Registration[];
  returnRegistrations: Registration[];
  metadata: {
    fetchedAt: string;
    warrantyCount: number;
    returnCount: number;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadRegistrations(
  registrations: Registration[],
  collectionName: string,
  label: string
): Promise<number> {
  console.log(`\nUploading ${registrations.length} ${label}...`);

  const batchSize = 400; // Slightly under Firestore's 500 limit for safety
  let uploaded = 0;

  for (let i = 0; i < registrations.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = registrations.slice(i, i + batchSize);

    for (const reg of chunk) {
      const docRef = doc(db, collectionName, String(reg.id));
      batch.set(docRef, reg);
    }

    try {
      await batch.commit();
      uploaded += chunk.length;

      const progress = Math.round((uploaded / registrations.length) * 100);
      process.stdout.write(`\r  Progress: ${uploaded}/${registrations.length} (${progress}%)`);

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < registrations.length) {
        await sleep(1000); // 1 second between batches
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("Quota exceeded")) {
        console.error(`\n\n❌ Quota exceeded after uploading ${uploaded} records.`);
        console.error("Wait 24 hours for quota to reset, then run the script again.");
        process.exit(1);
      }
      throw error;
    }
  }

  console.log(`\n  ✓ Uploaded ${uploaded} ${label}`);
  return uploaded;
}

async function main() {
  const uploadType = process.argv[2]?.toLowerCase(); // "warranty", "return", or undefined for both

  console.log("========================================");
  console.log("Firebase Population Script");
  console.log("========================================\n");

  if (uploadType && !["warranty", "return"].includes(uploadType)) {
    console.error("Invalid argument. Use: warranty, return, or no argument for both.");
    process.exit(1);
  }

  // Read the JSON file
  const jsonPath = path.join(process.cwd(), "public", "data", "registrations.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: JSON file not found at ${jsonPath}`);
    console.error("Run 'npm run fetch-data' first to generate the JSON file.");
    process.exit(1);
  }

  console.log(`Reading ${jsonPath}...`);
  const jsonContent = fs.readFileSync(jsonPath, "utf-8");
  const data: StaticData = JSON.parse(jsonContent);

  console.log(`Found ${data.warrantyRegistrations.length} warranty claims`);
  console.log(`Found ${data.returnRegistrations.length} return claims`);
  console.log(`Data fetched at: ${data.metadata.fetchedAt}`);

  if (uploadType) {
    console.log(`\nUpload type: ${uploadType} only`);
  } else {
    console.log(`\nUpload type: all`);
  }

  try {
    // Upload warranty claims
    if (!uploadType || uploadType === "warranty") {
      await uploadRegistrations(
        data.warrantyRegistrations,
        COLLECTIONS.WARRANTY,
        "warranty claims"
      );
    }

    // Upload return claims
    if (!uploadType || uploadType === "return") {
      await uploadRegistrations(
        data.returnRegistrations,
        COLLECTIONS.RETURN,
        "return claims"
      );
    }

    // Update metadata
    console.log("\nUpdating metadata...");
    await setDoc(doc(db, COLLECTIONS.METADATA, "lastUpdate"), {
      lastUpdated: data.metadata.fetchedAt
    });
    console.log("  ✓ Metadata updated");

    console.log("\n========================================");
    console.log("Firebase population complete!");
    if (!uploadType || uploadType === "warranty") {
      console.log(`Warranty claims: ${data.warrantyRegistrations.length}`);
    }
    if (!uploadType || uploadType === "return") {
      console.log(`Return claims: ${data.returnRegistrations.length}`);
    }
    console.log("========================================");

  } catch (error) {
    console.error("\nERROR: Firebase upload failed:", error);
    process.exit(1);
  }
}

main();

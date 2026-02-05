/**
 * Build-time data fetching script
 *
 * This script fetches all registration data from the MyProductCares API
 * and saves it to:
 * 1. Firebase Firestore (for production use)
 * 2. Static JSON file (for backup/reference)
 *
 * Usage: npx tsx scripts/fetch-data.ts
 * Requires: API_TOKEN environment variable
 */

import * as fs from "fs";
import * as path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCsq18Lx-RaMf9eWproxaKGiMd-fkIdOPY",
  authDomain: "pms-dashboard-62bc7.firebaseapp.com",
  projectId: "pms-dashboard-62bc7",
  storageBucket: "pms-dashboard-62bc7.firebasestorage.app",
  messagingSenderId: "1065957058566",
  appId: "1:1065957058566:web:6db647024140fc196ebb87"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const COLLECTIONS = {
  WARRANTY: "warranty-claims",
  RETURN: "return-claims",
  METADATA: "metadata"
};

const API_BASE_URL = "https://product-reg.varify.xyz/api";

interface Registration {
  id: string | number;
  customerName?: string;
  customerEmail?: string;
  productName?: string;
  productSku?: string;
  serialNumbers?: string[];
  purchaseDate?: string;
  createdAt?: string;
  status?: string;
  type?: string;
  warranty?: string;
  warrantyEndDate?: string;
  fieldData?: Record<string, unknown>;
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

async function fetchRegistrationsPage(
  apiToken: string,
  page: number,
  limit: number,
  formSlug: string,
  maxRetries: number = 5
): Promise<{ data: Registration[]; hasMore: boolean }> {
  const url = `${API_BASE_URL}/registrations?page=${page}&limit=${limit}&formSlug=${formSlug}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  Rate limited, waiting ${delay / 1000}s before retry ${attempt}/${maxRetries}...`);
      await sleep(delay);
    }

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
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

      const result = await response.json();
      const data = result.data || [];

      return {
        data,
        hasMore: data.length === limit,
      };
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`  Request failed, retrying...`);
    }
  }

  throw new Error("Max retries exceeded");
}

async function fetchAllRegistrations(
  apiToken: string,
  formSlug: string
): Promise<Registration[]> {
  const allRegistrations: Registration[] = [];
  const seenIds = new Set<string | number>();
  let page = 1;
  const limit = 100; // Fast fetch for bulk data

  console.log(`\nFetching ${formSlug} registrations...`);

  while (true) {
    console.log(`  Page ${page}...`);

    const { data, hasMore } = await fetchRegistrationsPage(
      apiToken,
      page,
      limit,
      formSlug
    );

    for (const reg of data) {
      if (!seenIds.has(reg.id)) {
        seenIds.add(reg.id);
        allRegistrations.push(reg);
      }
    }

    console.log(`  Got ${data.length} records (total: ${allRegistrations.length})`);

    if (!hasMore) {
      console.log(`  No more pages, stopping.`);
      break;
    }

    page++;
    await sleep(2000); // 2 second delay to avoid rate limiting

    if (page > 500) {
      console.log(`  Reached page limit, stopping.`);
      break;
    }
  }

  console.log(`Finished ${formSlug}: ${allRegistrations.length} total records\n`);
  return allRegistrations;
}

// Upload registrations to Firebase
async function uploadToFirebase(
  registrations: Registration[],
  collectionName: string,
  label: string
): Promise<number> {
  console.log(`Uploading ${registrations.length} ${label} to Firebase...`);

  const batchSize = 400;
  let uploaded = 0;

  for (let i = 0; i < registrations.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = registrations.slice(i, i + batchSize);

    for (const reg of chunk) {
      const docRef = doc(db, collectionName, String(reg.id));
      batch.set(docRef, reg, { merge: true });
    }

    await batch.commit();
    uploaded += chunk.length;

    const progress = Math.round((uploaded / registrations.length) * 100);
    process.stdout.write(`\r  Progress: ${uploaded}/${registrations.length} (${progress}%)`);

    // Delay between batches
    if (i + batchSize < registrations.length) {
      await sleep(500);
    }
  }

  console.log(`\n  ✓ Uploaded ${uploaded} ${label}`);
  return uploaded;
}

async function main() {
  const apiToken = process.env.API_TOKEN;

  if (!apiToken) {
    console.error("ERROR: API_TOKEN environment variable is required");
    process.exit(1);
  }

  console.log("========================================");
  console.log("PMS Dashboard - Build-time Data Fetch");
  console.log("========================================");
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    // Fetch warranty claims
    const warrantyRegistrations = await fetchAllRegistrations(
      apiToken,
      "warranty-claim"
    );

    // Fetch return claims
    const returnRegistrations = await fetchAllRegistrations(
      apiToken,
      "return-claim"
    );

    // Create the static data object
    const staticData: StaticData = {
      warrantyRegistrations,
      returnRegistrations,
      metadata: {
        fetchedAt: new Date().toISOString(),
        warrantyCount: warrantyRegistrations.length,
        returnCount: returnRegistrations.length,
      },
    };

    // Ensure the output directory exists
    const outputDir = path.join(process.cwd(), "public", "data");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the data to a JSON file (backup)
    const outputPath = path.join(outputDir, "registrations.json");
    fs.writeFileSync(outputPath, JSON.stringify(staticData, null, 2));
    console.log(`JSON backup saved to: ${outputPath}`);

    // Upload to Firebase
    console.log("\n--- Uploading to Firebase ---");
    await uploadToFirebase(warrantyRegistrations, COLLECTIONS.WARRANTY, "warranty claims");
    await uploadToFirebase(returnRegistrations, COLLECTIONS.RETURN, "return claims");

    // Update Firebase metadata
    await setDoc(doc(db, COLLECTIONS.METADATA, "lastUpdate"), {
      lastUpdated: staticData.metadata.fetchedAt
    });
    console.log("  ✓ Metadata updated");

    console.log("\n========================================");
    console.log("Data fetch complete!");
    console.log(`Warranty claims: ${warrantyRegistrations.length}`);
    console.log(`Return claims: ${returnRegistrations.length}`);
    console.log(`Output: ${outputPath}`);
    console.log(`Finished at: ${new Date().toISOString()}`);
    console.log("========================================");
  } catch (error) {
    console.error("ERROR: Data fetch failed:", error);
    process.exit(1);
  }
}

main();

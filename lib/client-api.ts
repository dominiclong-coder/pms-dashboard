// Client-side data loading with Firebase for persistent shared storage

import { Registration, StaticData } from "./types";
import { loadFromFirebase, saveToFirebase, getExistingIds } from "./firebase";

// Re-export types for backward compatibility
export type { Registration, StaticData };

const API_BASE_URL = "https://product-reg.varify.xyz/api";

// API token embedded at build time (for refresh functionality)
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

// Helper function for delays (used for rate limiting)
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Format the last updated timestamp for display
export function formatLastUpdated(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Load data from Firebase (replaces static JSON)
export async function loadStaticData(): Promise<StaticData> {
  const { warrantyRegistrations, returnRegistrations, metadata } = await loadFromFirebase();

  return {
    warrantyRegistrations,
    returnRegistrations,
    metadata: {
      fetchedAt: metadata?.lastUpdated || new Date().toISOString(),
      warrantyCount: warrantyRegistrations.length,
      returnCount: returnRegistrations.length,
    }
  };
}

// Fetch a single page of registrations from the API
async function fetchPage(
  page: number,
  limit: number,
  formSlug: string
): Promise<{ data: Registration[]; hasMore: boolean }> {
  const url = `${API_BASE_URL}/registrations?page=${page}&limit=${limit}&formSlug=${formSlug}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const result = await response.json();
  const data = result.data || [];

  return {
    data,
    hasMore: data.length === limit,
  };
}

// Fetch registrations that we don't already have and save to Firebase
// Uses limit=2 to catch records missed by the bulk fetch (API pagination quirk)
export async function fetchNewestRegistrations(
  formSlug: string,
  sinceTimestamp: string,
  existingIds: Set<string | number>,
  onProgress?: (count: number) => void
): Promise<Registration[]> {
  // Skip refresh if Firebase has no data for this claim type
  // This prevents trying to fetch thousands of records when Firebase is empty
  if (existingIds.size === 0) {
    console.log(`Skipping refresh for ${formSlug} - no existing data in Firebase`);
    return [];
  }

  const newRegistrations: Registration[] = [];
  let page = 1;
  const limit = 2; // Small limit to catch records missed by limit=100 bulk fetch
  let consecutiveOldPages = 0;

  while (true) {
    try {
      const { data, hasMore } = await fetchPage(page, limit, formSlug);

      let newInThisPage = 0;

      for (const reg of data) {
        // Add any record we don't already have
        if (!existingIds.has(reg.id)) {
          newRegistrations.push(reg);
          newInThisPage++;
        }
      }

      if (onProgress) {
        onProgress(newRegistrations.length);
      }

      // If we got a page with no new records, we've caught up with what limit=100 fetched
      if (newInThisPage === 0) {
        consecutiveOldPages++;
        // Need a few consecutive pages since missing records may be scattered
        if (consecutiveOldPages >= 5) {
          break;
        }
      } else {
        consecutiveOldPages = 0;
      }

      if (!hasMore) break;
      page++;

      // Rate limiting: 1 second delay between requests
      await sleep(1000);

      // Safety limit - fetch up to 100 pages (200 records with limit=2)
      // This catches the ~100 missing records from the limit=100 bulk fetch
      if (page > 100) break;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  // Save new registrations to Firebase so everyone can see them
  if (newRegistrations.length > 0) {
    try {
      await saveToFirebase(newRegistrations, formSlug);
      console.log(`Saved ${newRegistrations.length} new ${formSlug} records to Firebase`);
    } catch (error) {
      console.error("Error saving to Firebase:", error);
    }
  }

  return newRegistrations;
}

// Get existing IDs from Firebase (for checking what we already have)
export { getExistingIds };

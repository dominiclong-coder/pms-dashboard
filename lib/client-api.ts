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
): Promise<{ data: Registration[]; hasMore: boolean; total: number }> {
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
  const total = result.total ?? result.meta?.total ?? 0;

  return {
    data,
    hasMore: data.length === limit,
    total,
  };
}

// Fetch registrations that we don't already have and save to Firebase
// Uses limit=2 to catch records missed by the bulk fetch (API pagination quirk)
export async function fetchNewestRegistrations(
  formSlug: string,
  sinceTimestamp: string,
  existingIds: Set<string | number>,
  onProgress?: (count: number) => void,
  forceFullScan?: boolean
): Promise<Registration[]> {
  // Skip refresh if Firebase has no data for this claim type
  if (existingIds.size === 0) {
    console.log(`Skipping refresh for ${formSlug} - no existing data in Firebase`);
    return [];
  }

  // Check the API total to detect whether Firebase has gaps
  let apiTotal = 0;
  try {
    const firstCheck = await fetchPage(1, 1, formSlug);
    apiTotal = firstCheck.total;
  } catch (error) {
    console.warn(`Could not fetch total count for ${formSlug}, falling back to fast scan`);
  }

  const gap = apiTotal > 0 ? apiTotal - existingIds.size : 0;
  console.log(`${formSlug}: Firebase has ${existingIds.size}, API total ${apiTotal}, gap ${gap}`);

  // No meaningful gap — Firebase is up to date, nothing to do
  if (apiTotal > 0 && gap <= 0) {
    console.log(`${formSlug}: Firebase is up to date, skipping scan`);
    return [];
  }

  const newRegistrations: Registration[] = [];

  const fullScan = forceFullScan || gap > 100;
  if (fullScan) {
    console.log(`Large gap detected (${gap}), running full scan for ${formSlug}...`);
  }

  {
    let page = 1;
    const limit = 2;
    let consecutiveOldPages = 0;

    while (true) {
      try {
        const { data, hasMore } = await fetchPage(page, limit, formSlug);

        let newInThisPage = 0;
        for (const reg of data) {
          if (!existingIds.has(reg.id)) {
            newRegistrations.push(reg);
            newInThisPage++;
          }
        }

        if (onProgress) onProgress(newRegistrations.length);

        if (newInThisPage === 0) {
          consecutiveOldPages++;
          // Full scan: go all the way to the end to catch any historical gaps
          // Fast scan: stop early once we've caught up
          if (!fullScan && consecutiveOldPages >= 5) break;
          if (fullScan && !hasMore) break;
        } else {
          consecutiveOldPages = 0;
        }

        if (!hasMore) break;
        page++;
        await sleep(1000);
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        break;
      }
    }
  }

  // Save new registrations to Firebase so they persist
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

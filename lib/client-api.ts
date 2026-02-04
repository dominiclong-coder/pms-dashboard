// Client-side data loading for static GitHub Pages deployment
// Hybrid approach: Static data for instant load + API fetch for refresh

import { Registration, StaticData } from "./types";

// Re-export types for backward compatibility
export type { Registration, StaticData };

const API_BASE_URL = "https://product-reg.varify.xyz/api";

// API token embedded at build time (for refresh functionality)
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

// Helper function for delays (used for rate limiting)
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Load pre-fetched static data from the JSON file
export async function loadStaticData(): Promise<StaticData> {
  // Use basePath for GitHub Pages deployment
  const basePath = process.env.NODE_ENV === "production" ? "/pms-dashboard" : "";
  const response = await fetch(`${basePath}/data/registrations.json`);

  if (!response.ok) {
    throw new Error(`Failed to load data: ${response.status}`);
  }

  return response.json();
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

// Fetch only NEW registrations since a given timestamp
// Returns records created AFTER the sinceTimestamp
export async function fetchNewestRegistrations(
  formSlug: string,
  sinceTimestamp: string,
  existingIds: Set<string | number>,
  onProgress?: (count: number) => void
): Promise<Registration[]> {
  const newRegistrations: Registration[] = [];
  const sinceDate = new Date(sinceTimestamp);
  let page = 1;
  const limit = 100;
  let consecutiveOldPages = 0;

  while (true) {
    try {
      const { data, hasMore } = await fetchPage(page, limit, formSlug);

      let newInThisPage = 0;
      let oldInThisPage = 0;

      for (const reg of data) {
        // Skip if we already have this record
        if (existingIds.has(reg.id)) {
          oldInThisPage++;
          continue;
        }

        // Check if this record is newer than our static data
        const regDate = reg.createdAt ? new Date(reg.createdAt) : null;
        if (regDate && regDate > sinceDate) {
          newRegistrations.push(reg);
          newInThisPage++;
        } else {
          oldInThisPage++;
        }
      }

      if (onProgress) {
        onProgress(newRegistrations.length);
      }

      // If we got a page with no new records, we've probably caught up
      if (newInThisPage === 0) {
        consecutiveOldPages++;
        if (consecutiveOldPages >= 2) {
          break;
        }
      } else {
        consecutiveOldPages = 0;
      }

      if (!hasMore) break;
      page++;

      // Rate limiting: 2 second delay between requests
      await sleep(2000);

      // Safety limit
      if (page > 100) break;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  return newRegistrations;
}

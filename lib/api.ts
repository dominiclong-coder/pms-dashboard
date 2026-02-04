// MyProductCares API client utilities

const API_BASE_URL = "https://product-reg.varify.xyz/api";

// Helper function for delays (used for rate limiting)
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface Registration {
  id: string | number;
  customerName?: string;
  customerEmail?: string;
  productName?: string;
  serialNumbers?: string[];
  createdAt?: string;
  status?: string;
  type?: string;
  fieldData?: Record<string, unknown>;
  warranty?: number;
  warrantyEndDate?: string | null;
}

export interface Form {
  name: string;
  slug: string;
  description?: string;
}

export interface RegistrationsResponse {
  registrations: Registration[];
  total: number;
  lastUpdated: string;
}

export async function fetchForms(apiToken: string): Promise<Form[]> {
  const response = await fetch(`${API_BASE_URL}/forms`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || [];
}

// Fetch a single page of registrations
// Uses Bearer token in Authorization header and formSlug parameter
// Includes retry logic for 429 rate limit errors with exponential backoff
export async function fetchRegistrationsPage(
  apiToken: string,
  page: number = 1,
  limit: number = 100,
  claimType?: string,
  maxRetries: number = 5
): Promise<{ data: Registration[]; hasMore: boolean }> {
  // Use formSlug parameter (API uses formSlug, not type)
  let url = `${API_BASE_URL}/registrations?page=${page}&limit=${limit}`;
  if (claimType) {
    url += `&formSlug=${claimType}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  Rate limited, waiting ${delay / 1000}s before retry ${attempt}/${maxRetries}...`);
      await sleep(delay);
    }

    console.log(`  Fetching page ${page} for ${claimType || "all"} (limit=${limit})...`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      lastError = new Error(`API rate limited (429)`);
      continue; // Retry
    }

    if (!response.ok) {
      const text = await response.text();
      console.error(`  API error: ${response.status} - ${text}`);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const data = result.data || [];
    console.log(`  Response: ${data.length} records`);

    return {
      data,
      hasMore: data.length === limit,
    };
  }

  throw lastError || new Error("Max retries exceeded");
}

// BATCH SYNC APPROACH:
// 1. Initial sync: fetchHistoricalRegistrations (limit=100, 2s delay between requests)
// 2. Manual refresh: fetchNewestRegistrations (limit=100, fetches only new records)
// Per developer recommendation: use limit=100 and 2 second delay to avoid rate limiting

// Fetch historical/bulk data (initial sync)
export async function fetchHistoricalRegistrations(
  apiToken: string,
  claimType: string,
  onProgress?: (loaded: number, page: number) => void
): Promise<Registration[]> {
  const allRegistrations: Registration[] = [];
  const seenIds = new Set<string | number>();
  let page = 1;
  const limit = 100; // Per developer recommendation

  console.log(`  Fetching historical data for ${claimType} (limit=${limit})...`);

  while (true) {
    try {
      const { data, hasMore } = await fetchRegistrationsPage(apiToken, page, limit, claimType, 5);

      for (const reg of data) {
        if (!seenIds.has(reg.id)) {
          seenIds.add(reg.id);
          allRegistrations.push(reg);
        }
      }

      if (onProgress) {
        onProgress(allRegistrations.length, page);
      }

      if (!hasMore) break;
      page++;
      await sleep(2000); // 2 second delay per developer recommendation

      if (page > 500) {
        console.warn(`  Reached page limit for ${claimType}`);
        break;
      }
    } catch (error) {
      console.error(`  Historical sync error at page ${page}: ${error}`);
      break;
    }
  }

  console.log(`  Historical sync complete: ${allRegistrations.length} records`);
  return allRegistrations;
}

// Fetch newest records (for manual refresh)
// API returns latest records first, so we fetch until we find records we already have
// CRITICAL API BUG: The API returns different "newest" records depending on limit value!
// - limit=1 returns the actual newest record
// - limit=10 returns records from ~10 hours ago
// - limit=100 returns records from ~2 days ago
// We must use limit=1 to get truly newest records, then fetch more pages.
export async function fetchNewestRegistrations(
  apiToken: string,
  claimType: string,
  existingIds: Set<string | number>,
  maxPages: number = 500, // Many pages since we're using limit=1
  onProgress?: (loaded: number, page: number) => void
): Promise<Registration[]> {
  const newRegistrations: Registration[] = [];
  let page = 1;
  const limit = 1; // Must use limit=1 to get actual newest records (critical API bug)
  let consecutiveExisting = 0;

  console.log(`  Fetching newest ${claimType} records (limit=${limit}, max ${maxPages} pages)...`);

  while (page <= maxPages) {
    try {
      const { data, hasMore } = await fetchRegistrationsPage(apiToken, page, limit, claimType, 5);

      let newInThisPage = 0;
      for (const reg of data) {
        if (!existingIds.has(reg.id)) {
          newRegistrations.push(reg);
          newInThisPage++;
        }
      }

      if (onProgress) {
        onProgress(newRegistrations.length, page);
      }

      // If we got a page with no new records, we've probably caught up
      if (newInThisPage === 0) {
        consecutiveExisting++;
        if (consecutiveExisting >= 2) {
          console.log(`  Found 2 consecutive pages with no new records, stopping`);
          break;
        }
      } else {
        consecutiveExisting = 0;
      }

      if (!hasMore) break;
      page++;
      await sleep(2000); // 2 second delay per developer recommendation
    } catch (error) {
      console.warn(`  Newest records fetch stopped at page ${page}: ${error}`);
      break;
    }
  }

  console.log(`  Found ${newRegistrations.length} new records`);
  return newRegistrations;
}

// Legacy function - fetches all records (slow, use batch approach instead)
export async function fetchAllRegistrationsForForm(
  apiToken: string,
  formSlug: string,
  onProgress?: (loaded: number, page: number) => void
): Promise<Registration[]> {
  // Just use historical fetch for backward compatibility
  return fetchHistoricalRegistrations(apiToken, formSlug, onProgress);
}

// Fetch counts for all forms
export async function fetchAllFormCounts(
  apiToken: string,
  forms: Form[],
  onProgress?: (formSlug: string, count: number, formIndex: number, totalForms: number) => void
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const registrations = await fetchAllRegistrationsForForm(apiToken, form.slug);
    counts[form.slug] = registrations.length;

    if (onProgress) {
      onProgress(form.slug, registrations.length, i + 1, forms.length);
    }
  }

  return counts;
}

// Fetch recent registrations for a specific form (for quick display)
export async function fetchRecentRegistrations(
  apiToken: string,
  limit: number = 100,
  formSlug?: string
): Promise<Registration[]> {
  let url = `${API_BASE_URL}/registrations?limit=${limit}`;
  if (formSlug) {
    url += `&formSlug=${formSlug}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || [];
}

// Fetch new registrations since a date for a specific form
export async function fetchNewRegistrationsForForm(
  apiToken: string,
  formSlug: string,
  sinceDate: string
): Promise<Registration[]> {
  const newRegistrations: Registration[] = [];
  const sinceTimestamp = new Date(sinceDate).getTime();
  let page = 1;
  const limit = 1000;

  while (true) {
    const { data } = await fetchRegistrationsPage(apiToken, page, limit, formSlug);

    let foundOlder = false;
    for (const reg of data) {
      const regDate = reg.createdAt ? new Date(reg.createdAt).getTime() : 0;

      if (regDate > sinceTimestamp) {
        newRegistrations.push(reg);
      } else {
        foundOlder = true;
        break;
      }
    }

    if (foundOlder || data.length < limit) {
      break;
    }

    page++;

    if (page > 50) {
      break;
    }
  }

  return newRegistrations;
}

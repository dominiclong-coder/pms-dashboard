// Client-side API for fetching directly from MyProductCares API
// Used for static GitHub Pages deployment

const API_BASE_URL = "https://product-reg.varify.xyz/api";

// API token embedded at build time
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

export interface Registration {
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
  fieldData?: Record<string, unknown>;
}

// Helper function for delays (used for rate limiting)
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch a single page of registrations
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

// Fetch all registrations for a form type
// Uses smaller batches to work around API pagination bug
export async function fetchAllRegistrations(
  formSlug: string,
  onProgress?: (loaded: number, page: number) => void
): Promise<Registration[]> {
  const allRegistrations: Registration[] = [];
  const seenIds = new Set<string | number>();
  let page = 1;
  const limit = 100; // Use 100 for bulk fetching

  while (true) {
    try {
      const { data, hasMore } = await fetchPage(page, limit, formSlug);

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

      // Rate limiting: 2 second delay between requests
      await sleep(2000);

      // Safety limit
      if (page > 500) break;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  return allRegistrations;
}

// Fetch recent registrations (for quick initial load)
export async function fetchRecentRegistrations(
  formSlug: string,
  maxRecords: number = 1000
): Promise<Registration[]> {
  const registrations: Registration[] = [];
  const seenIds = new Set<string | number>();
  let page = 1;
  const limit = 100;

  while (registrations.length < maxRecords) {
    try {
      const { data, hasMore } = await fetchPage(page, limit, formSlug);

      for (const reg of data) {
        if (!seenIds.has(reg.id)) {
          seenIds.add(reg.id);
          registrations.push(reg);
        }
      }

      if (!hasMore || registrations.length >= maxRecords) break;
      page++;

      await sleep(2000);

      if (page > 20) break; // Limit pages for quick load
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  return registrations;
}

// Cache in localStorage for persistence between page loads
const CACHE_KEY = "myproductcares_cache";
const CACHE_EXPIRY_HOURS = 1;

interface CachedData {
  registrationsByForm: Record<string, Registration[]>;
  timestamp: number;
}

export function getCachedData(): CachedData | null {
  if (typeof window === "undefined") return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data: CachedData = JSON.parse(cached);
    const hoursSinceCache = (Date.now() - data.timestamp) / (1000 * 60 * 60);

    if (hoursSinceCache > CACHE_EXPIRY_HOURS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function setCachedData(registrationsByForm: Record<string, Registration[]>): void {
  if (typeof window === "undefined") return;

  try {
    const data: CachedData = {
      registrationsByForm,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to cache data:", error);
  }
}

export function clearCache(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_KEY);
}

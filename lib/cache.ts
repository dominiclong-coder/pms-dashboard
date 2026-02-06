// File-based cache for registration data
// Data persists across server restarts

import fs from "fs";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), "data", "cache.json");

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
  shopifyOrderId?: string | null;
  shopifyOrderName?: string | null;
  shopifyOrderCreatedAt?: string | null;
  fieldData?: Record<string, unknown>;
}

interface PersistedCacheData {
  registrationsByForm: Record<string, Registration[]>;
  countsByForm: Record<string, number>;
  totalCount: number;
  lastFullSync: string | null;
  lastIncrementalSync: string | null;
  hasCompletedInitialSync: boolean;
}

interface CacheData extends PersistedCacheData {
  isSyncing: boolean;
  syncProgress: {
    currentForm: string;
    currentFormIndex: number;
    totalForms: number;
    currentFormCount: number;
    isIncremental: boolean;
  };
}

// Runtime state (not persisted)
let isSyncing = false;
let syncProgress = {
  currentForm: "",
  currentFormIndex: 0,
  totalForms: 0,
  currentFormCount: 0,
  isIncremental: false,
};

// In-memory cache (loaded from file on startup)
let cache: PersistedCacheData = {
  registrationsByForm: {},
  countsByForm: {},
  totalCount: 0,
  lastFullSync: null,
  lastIncrementalSync: null,
  hasCompletedInitialSync: false,
};

// Ensure data directory exists
function ensureDataDir(): void {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Load cache from file
function loadCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(data) as PersistedCacheData;
      cache = parsed;
      console.log(`Cache loaded: ${cache.totalCount} total records, last sync: ${cache.lastIncrementalSync}`);
    }
  } catch (error) {
    console.error("Failed to load cache from file:", error);
  }
}

// Save cache to file
function saveCache(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`Cache saved: ${cache.totalCount} total records`);
  } catch (error) {
    console.error("Failed to save cache to file:", error);
  }
}

// Initialize cache on module load
loadCache();

export function getCache(): CacheData {
  return {
    ...cache,
    registrationsByForm: { ...cache.registrationsByForm },
    countsByForm: { ...cache.countsByForm },
    isSyncing,
    syncProgress: { ...syncProgress },
  };
}

export function updateCache(data: Partial<PersistedCacheData>): void {
  Object.assign(cache, data);
  saveCache();
}

export function setFormRegistrations(formSlug: string, registrations: Registration[]): void {
  cache.registrationsByForm[formSlug] = registrations;
  cache.countsByForm[formSlug] = registrations.length;
  cache.totalCount = Object.values(cache.countsByForm).reduce((a, b) => a + b, 0);
  saveCache();
}

export function setCacheCountsByForm(countsByForm: Record<string, number>, isFullSync: boolean = true): void {
  cache.countsByForm = countsByForm;
  cache.totalCount = Object.values(countsByForm).reduce((a, b) => a + b, 0);

  const now = new Date().toISOString();
  if (isFullSync) {
    cache.lastFullSync = now;
    cache.hasCompletedInitialSync = true;
  }
  cache.lastIncrementalSync = now;
  saveCache();
}

export function markSyncComplete(isFullSync: boolean = true): void {
  const now = new Date().toISOString();
  if (isFullSync) {
    cache.lastFullSync = now;
    cache.hasCompletedInitialSync = true;
  }
  cache.lastIncrementalSync = now;
  saveCache();
}

export function updateFormCount(formSlug: string, count: number): void {
  cache.countsByForm[formSlug] = count;
  cache.totalCount = Object.values(cache.countsByForm).reduce((a, b) => a + b, 0);
  saveCache();
}

export function addToFormCount(formSlug: string, additionalCount: number): void {
  cache.countsByForm[formSlug] = (cache.countsByForm[formSlug] || 0) + additionalCount;
  cache.totalCount = Object.values(cache.countsByForm).reduce((a, b) => a + b, 0);
  cache.lastIncrementalSync = new Date().toISOString();
  saveCache();
}

export function addRegistrationsToForm(formSlug: string, newRegistrations: Registration[]): void {
  if (!cache.registrationsByForm[formSlug]) {
    cache.registrationsByForm[formSlug] = [];
  }
  // Add new registrations at the beginning (most recent first)
  cache.registrationsByForm[formSlug] = [...newRegistrations, ...cache.registrationsByForm[formSlug]];
  cache.countsByForm[formSlug] = cache.registrationsByForm[formSlug].length;
  cache.totalCount = Object.values(cache.countsByForm).reduce((a, b) => a + b, 0);
  cache.lastIncrementalSync = new Date().toISOString();
  saveCache();
}

export function setSyncStatus(
  syncing: boolean,
  progress?: {
    currentForm?: string;
    currentFormIndex?: number;
    totalForms?: number;
    currentFormCount?: number;
    isIncremental?: boolean;
  }
): void {
  isSyncing = syncing;
  if (progress) {
    syncProgress = {
      currentForm: progress.currentForm ?? syncProgress.currentForm,
      currentFormIndex: progress.currentFormIndex ?? syncProgress.currentFormIndex,
      totalForms: progress.totalForms ?? syncProgress.totalForms,
      currentFormCount: progress.currentFormCount ?? syncProgress.currentFormCount,
      isIncremental: progress.isIncremental ?? syncProgress.isIncremental,
    };
  }
}

export function shouldRefreshCache(): boolean {
  // Always need initial sync if not completed
  if (!cache.hasCompletedInitialSync) return true;

  // Incremental refresh every 5 minutes
  if (!cache.lastIncrementalSync) return true;

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return new Date(cache.lastIncrementalSync).getTime() < fiveMinutesAgo;
}

export function getLastSyncTime(): string | null {
  return cache.lastIncrementalSync || cache.lastFullSync;
}

export function hasCompletedInitialSync(): boolean {
  return cache.hasCompletedInitialSync;
}

export function getRegistrationsForForm(formSlug: string): Registration[] {
  return cache.registrationsByForm[formSlug] || [];
}

export function getAllRegistrations(): Record<string, Registration[]> {
  return cache.registrationsByForm;
}

// Get existing IDs for a form (for deduplication during incremental sync)
export function getExistingIds(formSlug: string): Set<string | number> {
  const registrations = cache.registrationsByForm[formSlug] || [];
  return new Set(registrations.map((r) => r.id));
}

// Clear cache (for manual reset if needed)
export function clearCache(): void {
  cache = {
    registrationsByForm: {},
    countsByForm: {},
    totalCount: 0,
    lastFullSync: null,
    lastIncrementalSync: null,
    hasCompletedInitialSync: false,
  };
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE);
  }
  console.log("Cache cleared");
}

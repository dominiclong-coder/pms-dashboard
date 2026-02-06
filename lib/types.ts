// Consolidated type definitions for the Claims Dashboard

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
  warranty?: string;
  warrantyEndDate?: string;
  shopifyOrderId?: string | null;
  shopifyOrderName?: string | null;
  shopifyOrderCreatedAt?: string | null;
  fieldData?: Record<string, unknown>;
}

export interface StaticData {
  warrantyRegistrations: Registration[];
  returnRegistrations: Registration[];
  metadata: {
    fetchedAt: string;
    warrantyCount: number;
    returnCount: number;
  };
}

export interface ChartDataPoint {
  period: string;
  periodLabel: string;
  claimCount: number;
  totalExposureDays: number;
  claimsPercentage: number;
}

export interface FilterValues {
  productNames: string[];
  skus: string[];
  serialNumbers: string[];
  reasons: string[];
  subReasons: string[];
  purchaseChannels: string[];
}

// Purchase volume data for cohort analysis
export interface PurchaseVolume {
  yearMonth: string;        // "2024-01" format
  product: string;          // "Dental Pod Go", "All Products", etc.
  purchaseCount: number;    // Number of units sold
}

export interface PurchaseVolumeData {
  volumes: PurchaseVolume[];
  lastUpdated: string;
}

// Cohort analysis data point
export interface CohortDataPoint {
  cohortMonth: string;           // "2024-01"
  cohortLabel: string;           // "Jan 2024"
  monthsSincePurchase: number;   // 0, 1, 2, ...
  claimCount: number;            // Claims filed (cumulative)
  purchaseVolume: number;        // Total purchases in cohort
  survivalRate: number;          // (1 - claims/purchases) * 100
  claimRate: number;             // (claims/purchases) * 100
}

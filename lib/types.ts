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

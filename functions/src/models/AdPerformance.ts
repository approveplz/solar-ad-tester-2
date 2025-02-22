export interface TimeBasedMetrics {
    spend: number;
    revenue: number;
    roi: number;
    leads: number;
    clicks: number;
    costPerLead: number;
}

export interface PlatformMetrics {
    last3Days: TimeBasedMetrics;
    last7Days: TimeBasedMetrics;
    lifetime: TimeBasedMetrics;
}

export interface PerformanceMetrics {
    fb?: PlatformMetrics;
    ga?: PlatformMetrics;
}

export interface AdPerformance {
    counter: number;
    vertical: string;
    gDriveDownloadUrl: string;
    adName: string;
    fbAdId: string;
    fbAdSetId: string;
    fbCampaignId: string;
    fbScalingCampaignId: string;
    fbAccountId: string;
    ideaWriter: string;
    scriptWriter: string;
    hookWriter: string;
    performanceMetrics: PerformanceMetrics;
    fbIsActive: boolean;
    isHook: boolean;
    isScaled: boolean;
    hasHooksCreated: boolean;
    hasScaled: boolean;
    hasTrelloCardCreated: boolean;
    isFromTrelloCard: boolean;
    script?: string;
}

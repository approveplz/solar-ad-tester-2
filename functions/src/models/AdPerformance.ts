export interface PerformanceMetrics {
    fbSpendLast3Days: number;
    fbSpendLast7Days: number;
    fbSpendLifetime: number;
    fbRevenueLast3Days: number;
    fbRevenueLast7Days: number;
    fbRevenueLifetime: number;
}

export interface AdPerformance {
    vertical: string;
    gDriveDownloadUrl: string;
    adName: string;
    adId: string;
    adSetId: string;
    campaignId: string;
    ideaWriter: string;
    scriptWriter: string;
    hookWriter: string;
    performanceMetrics: PerformanceMetrics;
    fbIsActive: boolean;
    isHook: boolean;
}

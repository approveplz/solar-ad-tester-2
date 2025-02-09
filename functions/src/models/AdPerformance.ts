export interface PerformanceMetrics {
    fbSpendLast3Days: number;
    fbSpendLast7Days: number;
    fbSpendLifetime: number;
    fbRevenueLast3Days: number;
    fbRevenueLast7Days: number;
    fbRevenueLifetime: number;
    fbRoiLast3Days: number;
    fbRoiLast7Days: number;
    fbRoiLifetime: number;
}

export interface AdPerformance {
    counter: number;
    vertical: string;
    gDriveDownloadUrl: string;
    adName: string;
    fbAdId: string;
    fbAdSetId: string;
    fbCampaignId: string;
    fbAccountId: string;
    ideaWriter: string;
    scriptWriter: string;
    hookWriter: string;
    performanceMetrics: PerformanceMetrics;
    fbIsActive: boolean;
    isHook: boolean;
}

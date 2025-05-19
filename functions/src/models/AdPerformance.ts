import { MediaBuyerCodes } from '../helpers.js';

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
    scriptId?: string;
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
    mediaBuyer: MediaBuyerCodes;
}

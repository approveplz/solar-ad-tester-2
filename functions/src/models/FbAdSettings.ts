import { FbApiAdSetTargeting } from './MetaApiSchema.js';

export interface CampaignParams {
    objective: string;
    status: string;
}

export interface PromotedObjectParams {
    pixelId: string;
    customEventType: string;
    pageId: string;
}

export interface AdSetParams {
    bidAmountCents: number;
    optimizationGoal: string;
    billingEvent: string;
    /* Only include either daily or lifetime budget. Ad Set will be created differently based on which param is supplied */
    dailyBudgetCents?: string;
    lifetimeBudgetCents?: string;
    bidStrategy: string;
    adSetTargeting?: FbApiAdSetTargeting;
}

export interface AdCreativeParams {
    videoTitle: string;
    videoMessage: string;
    linkDescription: string;
    ctaType: string;
    ctaLinkValue: string;
    urlTrackingTags?: string;
}

export interface FbAdSettings {
    campaignParams: CampaignParams;
    promotedObjectParams: PromotedObjectParams;
    adSetParams: AdSetParams;
    adCreativeParams: AdCreativeParams;
}

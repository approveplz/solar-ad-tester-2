import { MediaBuyerCodes, VerticalCodes } from './helpers.js';

/*
Targeting saved here does not include age or gender
*/
export interface AdAccountConfigTargeting {
    geo_locations?: {
        location_types: string[];
        location_cluster_ids?: Array<{ key: string }>;
        countries?: string[];
    };
    excluded_geo_locations?: {
        regions: Array<{ key: string; name: string; country: string }>;
        location_types: string[];
    };
    excluded_custom_audiences?: Array<{ id: string; name: string }>;
    brand_safety_content_filter_levels?: string[];
    targeting_relaxation_types: {
        lookalike: number;
        custom_audience: number;
    };
    targeting_automation?: {
        advantage_audience: number;
    };
}

export interface AdAccountConfig {
    name: string;
    type: 'R' | 'O';
    campaignIds: Partial<{
        [key in MediaBuyerCodes]: string;
    }>;
    scalingCampaignId: string;
    targeting: AdAccountConfigTargeting;
    pageIds?: Partial<{
        [key in MediaBuyerCodes]: string;
    }>;
}

type AdAccountConfigData = Record<string, AdAccountConfig>;

export const AD_ACCOUNT_DATA: AdAccountConfigData = {
    '467161346185440': {
        name: 'Vincent x Digitsolution CC 1',
        type: VerticalCodes.R,
        campaignIds: {
            [MediaBuyerCodes.VB]: '120215523703190415',
        },
        scalingCampaignId: '120216751824410415',
        targeting: {
            // geo_locations: {
            //     location_types: ['home', 'recent'],
            //     location_cluster_ids: [{ key: '9096931440399416' }],
            // },
            excluded_custom_audiences: [
                {
                    id: '120214060134290415',
                    name: 'Roofing Leads 180d',
                },
            ],
            brand_safety_content_filter_levels: ['FEED_RELAXED'],
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
    '358423827304360': {
        name: 'Vincent x Digitsolution CC 2 New', // Marcus, Roofing
        type: VerticalCodes.R,
        campaignIds: {
            [MediaBuyerCodes.MA]: '120217711802790271',
        },
        scalingCampaignId: '',
        targeting: {
            excluded_custom_audiences: [
                {
                    id: '120226871220770271',
                    name: 'Roofing Lead (180d)',
                },
            ],
            brand_safety_content_filter_levels: ['FEED_RELAXED'],
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
    '822357702553382': {
        name: 'AWL_RN_FB_ABG-999490',
        type: VerticalCodes.O,
        campaignIds: {
            [MediaBuyerCodes.MA]: '120225994645600364',
            [MediaBuyerCodes.VB]: '120225757076490364',
            [MediaBuyerCodes.MT]: '120226260729990364',
            [MediaBuyerCodes.RD]: '120226260729990364',
            [MediaBuyerCodes.AZ]: '120227247011270364',
            [MediaBuyerCodes.BZ]: '120225994645600364',
        },
        scalingCampaignId: '',
        targeting: {
            geo_locations: {
                countries: ['US'],
                location_types: ['home', 'recent'],
            },
            excluded_custom_audiences: [
                {
                    id: '120225757247760364',
                    name: 'Purchase 180d',
                },
            ],
            excluded_geo_locations: {
                regions: [
                    {
                        key: '3861',
                        name: 'Louisiana',
                        country: 'US',
                    },
                    {
                        key: '3867',
                        name: 'Mississippi',
                        country: 'US',
                    },
                ],
                location_types: ['home', 'recent'],
            },
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
            // targeting_automation: {
            //     advantage_audience: 1,
            // },
        },
        pageIds: {
            [MediaBuyerCodes.MA]: '586354434572150',
            [MediaBuyerCodes.AZ]: '586354434572150',
            [MediaBuyerCodes.VB]: '617365471459541',
        },
    },
    '605772842474773': {
        name: 'MN_RN_FB_ABG-999388',
        type: VerticalCodes.O,
        campaignIds: {
            // TODO: Add actual campaign IDs for this account
            [MediaBuyerCodes.MA]: '',
            [MediaBuyerCodes.VB]: '',
            [MediaBuyerCodes.MT]: '',
            [MediaBuyerCodes.RD]: '',
            [MediaBuyerCodes.AZ]: '',
        },
        scalingCampaignId: '',
        targeting: {
            geo_locations: {
                countries: ['US'],
                location_types: ['home', 'recent'],
            },
            excluded_geo_locations: {
                regions: [
                    {
                        key: '3861',
                        name: 'Louisiana',
                        country: 'US',
                    },
                    {
                        key: '3867',
                        name: 'Mississippi',
                        country: 'US',
                    },
                ],
                location_types: ['home', 'recent'],
            },
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
    '544026081801735': {
        name: 'MN_RN_FB_ABG-999389',
        type: VerticalCodes.O,
        campaignIds: {
            // TODO: Add actual campaign IDs for this account
            [MediaBuyerCodes.MA]: '',
            [MediaBuyerCodes.VB]: '',
            [MediaBuyerCodes.MT]: '',
            [MediaBuyerCodes.RD]: '',
            [MediaBuyerCodes.AZ]: '',
        },
        scalingCampaignId: '',
        targeting: {
            geo_locations: {
                countries: ['US'],
                location_types: ['home', 'recent'],
            },
            excluded_geo_locations: {
                regions: [
                    {
                        key: '3861',
                        name: 'Louisiana',
                        country: 'US',
                    },
                    {
                        key: '3867',
                        name: 'Mississippi',
                        country: 'US',
                    },
                ],
                location_types: ['home', 'recent'],
            },
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
};

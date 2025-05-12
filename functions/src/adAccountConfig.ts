/*
Targeting saved here does not include age or gender
*/
export interface AdAccountConfigTargeting {
    geo_locations?: {
        location_types: string[];
        location_cluster_ids?: Array<{ key: string }>;
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
}

export interface AdAccountConfig {
    name: string;
    type: 'R' | 'O';
    campaignId: string;
    scalingCampaignId: string;
    targeting: AdAccountConfigTargeting;
}

type AdAccountConfigData = Record<string, AdAccountConfig>;

export const AD_ACCOUNT_DATA: AdAccountConfigData = {
    '467161346185440': {
        name: 'Vincent x Digitsolution CC 1',
        type: 'R',
        campaignId: '120215523703190415',
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
        type: 'R',
        campaignId: '120217711802790271',
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

    '8653880687969127': {
        name: 'Vincent x Digitsolution CC 2',
        type: 'R',
        campaignId: '120216226115490096',
        scalingCampaignId: '',
        targeting: {
            geo_locations: {
                location_types: ['home', 'recent'],
                // TODO: Change this to the correct location cluster ID
                location_cluster_ids: [{ key: '28950427651210969' }],
            },
            brand_safety_content_filter_levels: ['FEED_RELAXED'],
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
    '661505182923254': {
        name: 'AWL_RN_FB_ABG-342749',
        type: 'O',
        campaignId: '120215328779990104',
        scalingCampaignId: '',
        targeting: {
            geo_locations: {
                location_types: ['home', 'recent'],
            },
            brand_safety_content_filter_levels: ['FEED_RELAXED'],
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
    '916987259877684': {
        name: 'SF- 121 (EST) - Ronin WH 262 - TN_RN_FB_ABG-999019',
        type: 'O',
        campaignId: '120215328779990104',
        scalingCampaignId: '',
        targeting: {
            excluded_geo_locations: {
                regions: [
                    {
                        key: '3847',
                        name: 'California',
                        country: 'US',
                    },
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
            geo_locations: {
                location_types: ['home', 'recent'],
            },
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
};

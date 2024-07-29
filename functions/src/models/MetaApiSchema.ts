// Facebook API Requests
export interface FbApiCreateAdVideoRequest {
    name: string;
    file_url: string;
    description?: string;
    title?: string;
}

export interface FbApiCreateCampaignRequest {
    name: string;
    objective: 'OUTCOME_LEADS';
    bid_strategy?: string;
    daily_budget?: string;
    special_ad_categories: string[];
    status: 'PAUSED';
    promoted_object?: PromotedObject;
}

// https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/#fields
export interface FbApiCreateAdSetRequest {
    name: string;
    campaign_id: string;
    bid_amount: string;
    billing_event: 'IMPRESSIONS';
    start_time: string;
    bid_strategy: 'COST_CAP' | 'LOWEST_COST_WITH_BID_CAP';
    end_time: string;
    optimization_goal: 'OFFSITE_CONVERSIONS' | 'IMPRESSIONS'; // TODO: remove impressions after testing
    status: 'PAUSED';
    targeting: FbApiAdSetTargeting;
    is_dynamic_creative: boolean;
    // Only one: either daily_budget OR lifetime_budget
    lifetime_budget?: string;
    daily_budget?: string;
    destination_type?: string;
    promoted_object?: PromotedObject; // TODO: change back to required after testing
}

export interface FbApiCreateAdRequest {
    name: string;
    adset_id: string;
    creative: {
        creative_id: string;
    };
    status?: 'PAUSED';
}

// Facebook API Objects

export interface FbApiAdSetTargeting {
    age_max: number;
    age_min: number;
    excluded_custom_audiences?: { id: string }[];
    geo_locations?: {
        // Countries and Regions cant overlap
        countries?: string[];
        regions?: {
            key: string;
        }[];
    };
    targeting_automation?: {
        // 1 for true
        advantage_audience: number;
    };
}

export interface FbApiAdCreativeObjStorySpec {
    page_id: string;
    // TODO: add this back in after testing?
    instagram_actor_id?: string;
    video_data: {
        video_id: string;
        image_url: string;
        message?: string;
        title?: string;
        link_description?: string;
        call_to_action: {
            type: string;
            value: {
                link?: string;
            };
        };
    };
}

export interface PromotedObject {
    pixel_id: string;
    custom_event_type: 'LEAD';
}

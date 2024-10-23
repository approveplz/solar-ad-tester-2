// Facebook API Requests
export interface FbApiCreateAdVideoRequest {
    name: string;
    file_url: string;
    description?: string;
    title?: string;
}

export interface FbApiCreateCampaignRequest {
    name: string;
    objective: string;
    bid_strategy?: string;
    daily_budget?: string;
    special_ad_categories: string[];
    status: string;
    promoted_object?: PromotedObject;
}
// https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/#fields
export interface FbApiCreateAdSetRequest {
    name: string;
    campaign_id: string;
    bid_amount: string;
    billing_event: string;
    start_time?: string;
    bid_strategy?: string;
    end_time?: string;
    optimization_goal: string;
    status?: string;
    targeting?: FbApiAdSetTargeting;
    is_dynamic_creative?: boolean;
    /* Only one: either daily_budget OR lifetime_budget */
    lifetime_budget?: string;
    daily_budget?: string;
    destination_type?: string;
    promoted_object?: PromotedObject; // TODO: change back to required after testing
    attribution_spec?: {
        event_type: string;
        window_days: number;
    }[];
}

export interface FbApiCreateAdRequest {
    name: string;
    adset_id: string;
    creative: {
        creative_id: string;
    };
    status?: string;
}

// Facebook API Objects

export interface FbApiAdSetTargeting {
    age_max: number;
    age_min: number;
    excluded_custom_audiences?: { id: string }[];
    excluded_geo_locations?: {
        regions: {
            key: string;
            name: string;
            country: string;
        }[];
        location_types: string[];
    };
    geo_locations?: {
        zips?: {
            key: string;
            name: string;
            primary_city_id: number;
            region_id: number;
            country: string;
        }[];
        countries?: string[];
    };
    targeting_automation?: {
        // 1 for true
        advantage_audience: number;
    };
    targeting_relaxation_types?: {
        lookalike: number;
        custom_audience: number;
    };
}

export interface FbApiAdCreativeObjStorySpec {
    page_id?: string;
    instagram_actor_id?: string;
    video_data: {
        video_id: string;
        image_url?: string;
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
    custom_event_type: string;
    page_id?: string;
}

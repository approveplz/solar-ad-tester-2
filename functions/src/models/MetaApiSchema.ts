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
    bid_amount: number;
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

export interface FbApiGeoZipLocation {
    key: string;
    name?: string;
    primary_city_id?: number;
    region_id?: number;
    country?: string;
}

export interface FbApiGeoLocations {
    zips?: FbApiGeoZipLocation[];
    location_types?: string[];
    location_cluster_ids?: { key: string }[];
}

export interface FbApiAdSetTargeting {
    age_max: number;
    age_min: number;
    age_range?: [number, number];
    // 1 for male, 2 for female
    genders?: string[];
    excluded_custom_audiences?: { id: string }[];
    excluded_geo_locations?: {
        regions: {
            key: string;
            name: string;
            country: string;
        }[];
        location_types: string[];
    };
    geo_locations: FbApiGeoLocations;
    brand_safety_content_filter_levels?: string[];
    targeting_automation?: {
        // 1 for true
        advantage_audience?: number;
        individual_setting?: {
            age?: number; // If 1, meta can show ads above your age max
            gender?: number; // If 1, meta can show ads to other genders
        };
    };
    targeting_relaxation_types?: {
        lookalike: number;
        custom_audience: number;
    };
}

export interface FbApiAdCreativeVideoData {
    video_id: string;
    title: string;
    message: string;
    link_description: string;
    call_to_action: {
        type: string;
        value: {
            link: string;
        };
    };
    image_url: string;
}

export interface FbApiAdCreativeLinkData {
    link: string;
    message: string;
    name: string;
    description: string;
    image_hash: string;
    call_to_action: {
        type: string;
    };
}

export interface FbApiAdCreativeObjStorySpec {
    page_id: string;
    video_data?: FbApiAdCreativeVideoData;
    // Use LinkData for image ads
    link_data?: FbApiAdCreativeLinkData;
}

// https://developers.facebook.com/docs/marketing-api/creative/multi-advertiser-ads/
export interface FbApiContextualMultiAdsSpec {
    enroll_status: 'OPT_OUT' | 'OPT_IN';
}

export interface FbApiCreateAdCreativeRequest {
    name: string;
    object_story_spec: FbApiAdCreativeObjStorySpec;
    contextual_multi_ads: FbApiContextualMultiAdsSpec;
    url_tags: string;
}

export interface PromotedObject {
    pixel_id: string;
    custom_event_type: string;
    custom_event_str?: string;
    page_id?: string;
}

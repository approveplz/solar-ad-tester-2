import {
    FacebookAdsApi,
    AdAccount,
    AdCreative,
    AdSet,
    Ad,
    AdVideo,
    Campaign,
    AdImage,
} from 'facebook-nodejs-business-sdk';
type AdSetStatus = (typeof AdSet.Status)[keyof typeof AdSet.Status];
import fetch from 'node-fetch';
import {
    FbApiAdCreativeObjStorySpec,
    FbApiCreateAdRequest,
    FbApiAdSetTargeting,
    FbApiCreateAdSetRequest,
    FbApiCreateCampaignRequest,
    FbApiCreateAdVideoRequest,
    PromotedObject,
    FbApiCreateAdCreativeRequest,
    FbApiContextualMultiAdsSpec,
} from '../models/MetaApiSchema.js';
import { invariant } from '../helpers.js';
import { FbAdSettings } from '../models/FbAdSettings.js';
import { getNextWeekdayUnixSeconds } from '../helpers.js';
import { AD_ACCOUNT_DATA } from '../adAccountConfig.js';
import { MediaBuyerCodes } from '../helpers.js';

export default class MetaAdCreatorService {
    // @ts-ignore
    private appId: string;
    //@ts-ignore
    private appSecret: string;
    // @ts-ignore
    private accessToken: string;
    private accountId: string;
    // @ts-ignore
    private apiVersion: string;
    private adAccount: AdAccount;
    private api: FacebookAdsApi;

    constructor(options: {
        appId: string;
        appSecret: string;
        accessToken: string;
        accountId: string;
    }) {
        this.validateRequiredOptions(options);

        const { appId, appSecret, accessToken, accountId } = options;

        this.appId = appId;
        this.appSecret = appSecret;
        this.accessToken = accessToken;
        this.accountId = accountId;
        this.apiVersion = '22.0';

        this.api = FacebookAdsApi.init(accessToken);
        this.api.setDebug(true);

        this.adAccount = new AdAccount(`act_${this.accountId}`);

        console.log(
            `Initialized MetaAdCreatorService for account: ${this.accountId}`
        );
    }

    async createCampaign(params: {
        name: string;
        fbAdSettings: FbAdSettings;
    }): Promise<Campaign> {
        const { name, fbAdSettings } = params;
        const campaignParams = fbAdSettings.campaignParams;
        const { objective, status } = campaignParams;

        console.log(`Creating Facebook Ad campaign. Name: ${name}`);

        const createCampaignRequest: FbApiCreateCampaignRequest = {
            name,
            objective,
            status,
            special_ad_categories: [],
        };

        const campaign: Campaign = await this.adAccount.createCampaign(
            [],
            createCampaignRequest
        );

        console.log(`Campaign created. ID: ${campaign.id}`);

        return campaign;
    }

    /*
    Facebook API calls
    */
    async uploadAdVideo(params: {
        adName: string;
        videoFileUrl: string;
    }): Promise<AdVideo> {
        const { adName, videoFileUrl } = params;

        console.log(`
        Uploading video to Facebook. Url: ${videoFileUrl}
        Ad Name: ${adName}
        `);

        const createAdVideoRequest: FbApiCreateAdVideoRequest = {
            name: adName,
            file_url: videoFileUrl,
        };

        const adVideo: AdVideo = await this.adAccount.createAdVideo(
            [],
            createAdVideoRequest
        );

        await this.waitUntilVideoReady(adVideo, 10000, 180000);

        console.log(
            `Video uploaded to Facebook. Url: ${videoFileUrl}. ID: ${adVideo.id}`
        );
        return adVideo;
    }

    // https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages/#Creating
    async uploadAdImage(imageFileUrl: string): Promise<AdImage> {
        console.log(`Uploading image from URL: ${imageFileUrl}`);

        // Fetch the image
        const response = await fetch(imageFileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        // Get the image buffer
        const imageBuffer = Buffer.from(await response.arrayBuffer());

        // Convert to base64
        const imageBytes = imageBuffer.toString('base64');

        const adImage: AdImage = await this.adAccount.createAdImage(
            [AdImage.Fields.hash, AdImage.Fields.name, AdImage.Fields.id],
            {
                bytes: imageBytes,
            }
        );

        console.log(`Successfully uploaded image. Image ID: ${adImage.id}`);
        return adImage;
    }

    async createAdSet(params: {
        name: string;
        campaignId: string;
        fbAdSettings: FbAdSettings;
    }): Promise<AdSet> {
        const { name, campaignId, fbAdSettings } = params;
        console.log(`Creating Ad Set. Name: ${name}`);

        const {
            promotedObjectParams: { pixelId, customEventType, customEventStr },
            adSetParams: {
                bidAmountCents,
                optimizationGoal,
                billingEvent,
                dailyBudgetCents,
                lifetimeBudgetCents,
                bidStrategy,
                adSetTargeting,
                status,
            },
        } = fbAdSettings;

        invariant(adSetTargeting, 'adSetTargeting must be defined');
        const targeting: FbApiAdSetTargeting = adSetTargeting;

        invariant(
            !!lifetimeBudgetCents !== !!dailyBudgetCents, // Cant both be false or both be true
            'Only include either lifetime or daily budget'
        );

        const promotedObject: PromotedObject = {
            pixel_id: pixelId,
            custom_event_type: customEventType,
            custom_event_str: customEventStr,
        };

        // const startTimeUnixSeconds = getNextWeekdayUnixSeconds(now).toString();
        // Calculate tomorrow at 5am Pacific time (UTC-7)
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(12, 0, 0, 0); // 5am Pacific = 12pm UTC (5 + 7 = 12)

        const startTimeUnixSeconds = Math.floor(
            tomorrow.getTime() / 1000
        ).toString();

        const createAdSetRequest: FbApiCreateAdSetRequest = {
            name,
            status,
            campaign_id: campaignId,
            bid_amount: bidAmountCents,
            bid_strategy: bidStrategy,
            start_time: startTimeUnixSeconds,
            optimization_goal: optimizationGoal,
            targeting,
            billing_event: billingEvent,
            promoted_object: promotedObject,
            is_dynamic_creative: false,
            attribution_spec: [
                {
                    event_type: 'CLICK_THROUGH',
                    window_days: 7,
                },
                // {
                //     event_type: 'VIEW_THROUGH',
                //     window_days: 1,
                // },
                // {
                //     event_type: 'ENGAGED_VIDEO_VIEW',
                //     window_days: 1,
                // },
            ],
            daily_budget: dailyBudgetCents,
        };

        console.log(
            `createAdSetRequest for ${name}`,
            JSON.stringify(createAdSetRequest, null, 2)
        );

        try {
            const adSet: AdSet = await this.adAccount.createAdSet(
                [],
                createAdSetRequest
            );

            console.log(`AdSet created. ID: ${adSet.id}`);

            return adSet;
        } catch (error: any) {
            console.error(`Facebook API Error: ${error.message}`);
            throw error;
        }
    }

    async getAdSetIdFromAdId(adId: string): Promise<string> {
        console.log(`Getting AdSet ID for Ad ID: ${adId}`);
        try {
            const ad = new Ad(adId);
            const response = (await (ad.get(['adset_id']) as unknown)) as {
                adset_id: string;
            };
            const adsetId = response['adset_id'];

            if (!adsetId) {
                throw new Error('AdSet ID not found in response');
            }

            console.log(`Successfully retrieved AdSet ID: ${adsetId}`);
            return adsetId;
        } catch (error: any) {
            console.error(
                `Failed to get AdSet ID for Ad ID: ${adId}. Error: ${error.message}`
            );
            throw error;
        }
    }

    async duplicateAdSet(
        adSetId: string,
        campaignId: string,
        startTime: string | null = null
    ): Promise<AdSet> {
        const adSet = new AdSet(adSetId);

        const copyRequestParams = {
            campaign_id: campaignId,
            deep_copy: true,
            status_option: 'ACTIVE',
            rename_options: {
                rename_strategy: 'NO_RENAME',
            },
            ...(startTime && {
                start_time: startTime,
            }),
        };

        const duplicatedAdSet = await adSet.createCopy(
            ['id'],
            copyRequestParams
        );

        return new AdSet(duplicatedAdSet.id);
    }

    async createAdCreative(
        name: string,
        video: AdVideo,
        imageUrl: string,
        fbAdSettings: FbAdSettings
    ): Promise<AdCreative> {
        console.log(`Creating Ad Creative. Name: ${name}`);

        const {
            adCreativeParams: {
                videoTitle,
                videoMessage,
                linkDescription,
                ctaType,
                ctaLinkValue,
                urlTrackingTags,
            },
            promotedObjectParams: { pageId },
        } = fbAdSettings;

        invariant(pageId, 'pageId is required');

        const objectStorySpec: FbApiAdCreativeObjStorySpec = {
            page_id: pageId,
            video_data: {
                video_id: video.id,
                title: videoTitle,
                message: videoMessage,
                link_description: linkDescription,
                call_to_action: {
                    type: ctaType,
                    value: {
                        link: ctaLinkValue,
                    },
                },
                image_url: imageUrl,
            },
        };

        // Need to opt out of Contextual Multi Ads
        const contextualMultiAdsSpec: FbApiContextualMultiAdsSpec = {
            enroll_status: 'OPT_OUT',
        };

        invariant(urlTrackingTags, 'url tracking tags can not be empty');

        const createAdCreativeRequest: FbApiCreateAdCreativeRequest = {
            name,
            object_story_spec: objectStorySpec,
            contextual_multi_ads: contextualMultiAdsSpec,
            url_tags: urlTrackingTags,
        };

        try {
            const adCreative: AdCreative =
                await this.adAccount.createAdCreative(
                    [],
                    createAdCreativeRequest
                );
            console.log(`Created Ad Creative. Creative ID: ${adCreative.id}`);
            return adCreative;
        } catch (error: any) {
            console.error(`Facebook API Error: ${error.message}`);
            throw error;
        }
    }

    async createAdCreativeImage(
        name: string,
        adImage: AdImage,
        fbAdSettings: FbAdSettings
    ): Promise<AdCreative> {
        console.log(`Creating Ad Creative for Image. Name: ${name}`);

        const {
            adCreativeParams: {
                videoTitle,
                videoMessage,
                linkDescription,
                ctaType,
                ctaLinkValue,
                urlTrackingTags,
            },
            promotedObjectParams: { pageId },
        } = fbAdSettings;

        invariant(pageId, 'pageId is required');

        // We are reusing video ad params for images
        const objectStorySpec: FbApiAdCreativeObjStorySpec = {
            page_id: pageId,
            link_data: {
                link: ctaLinkValue,
                message: videoMessage,
                name: videoTitle,
                description: linkDescription,
                image_hash: adImage._data.images.bytes.hash,
                call_to_action: {
                    type: ctaType,
                },
            },
        };

        // Need to opt out of Contextual Multi Ads
        const contextualMultiAdsSpec: FbApiContextualMultiAdsSpec = {
            enroll_status: 'OPT_OUT',
        };

        const urlTags = urlTrackingTags;

        invariant(urlTags, 'url tracking tags are empty');

        const createAdCreativeRequest: FbApiCreateAdCreativeRequest = {
            name,
            object_story_spec: objectStorySpec,
            contextual_multi_ads: contextualMultiAdsSpec,
            url_tags: urlTags,
        };

        try {
            const adCreative: AdCreative =
                await this.adAccount.createAdCreative(
                    [],
                    createAdCreativeRequest
                );
            console.log(`Created Ad Creative. Creative ID: ${adCreative.id}`);
            return adCreative;
        } catch (error: any) {
            console.error(`Facebook API Error: ${error.message}`);
            throw error;
        }
    }

    //@ts-ignore
    async createAd(params: {
        name: string;
        adSet: AdSet;
        adCreative: AdCreative;
    }): Promise<Ad> {
        const { name, adSet, adCreative } = params;

        const createAdRequest: FbApiCreateAdRequest = {
            name,
            adset_id: adSet.id,
            creative: { creative_id: adCreative.id },
            status: 'ACTIVE',
        };

        const ad: Ad = await this.adAccount.createAd(['id'], createAdRequest);

        console.log(`Created Facebook Ad. Ad ID: ${ad.id}`);

        return ad;
    }

    async updateAdSetStatus(
        adSetId: string,
        status: AdSetStatus
    ): Promise<void> {
        console.log(
            `Updating AdSet status. AdSet ID: ${adSetId}, New status: ${status}`
        );
        try {
            const adSet = new AdSet(adSetId);
            await adSet.update([AdSet.Fields.status], { status });
            console.log(
                `Successfully updated AdSet status. AdSet ID: ${adSetId}`
            );
        } catch (error: any) {
            console.error(
                `Failed to update AdSet status. AdSet ID: ${adSetId}. Error: ${error.message}`
            );
            throw error;
        }
    }

    /**
     * Gets all ads for the current ad account with optional filter for active ads only
     * using direct account-level API call with pagination to get ALL ads
     * @param onlyActive When true, returns only active ads; when false, returns all ads
     * @returns Array of ads with their campaign and ad set information
     */
    async getAllAdsForCurrentAccount(onlyActive: boolean = false): Promise<
        Array<{
            campaignId: string;
            adSetId: string;
            adSetName: string;
            adId: string;
            adName: string;
            status: string;
        }>
    > {
        console.log(
            `Getting ${onlyActive ? 'active' : 'all'} ads for account: ${
                this.accountId
            }`
        );

        try {
            const statusFilter = onlyActive
                ? { effective_status: ['ACTIVE'] }
                : {};

            const allAds: any[] = [];

            // Get the first page of ads - Facebook SDK returns a Cursor object
            let adsCursor = await this.adAccount.getAds(
                [
                    'id',
                    'name',
                    'status',
                    'effective_status',
                    'adset_id',
                    'campaign_id',
                ],
                { limit: 100, ...statusFilter }
            );

            allAds.push(...adsCursor);

            // Paginate through remaining pages using the SDK's built-in pagination
            while (adsCursor.hasNext()) {
                adsCursor = await adsCursor.next();
                allAds.push(...adsCursor);
            }

            console.log(
                `Retrieved total of ${allAds.length} ads from account: ${this.accountId}`
            );

            // Transform to expected format
            const result = allAds.map((ad) => ({
                campaignId: ad._data.campaign_id,
                adSetId: ad._data.adset_id,
                adSetName: ad._data.adset_name,
                adId: ad.id,
                adName: ad._data.name,
                status: ad._data.effective_status,
            }));

            console.log(
                `Processed ${result.length} ads for account: ${this.accountId}`
            );
            return result;
        } catch (error) {
            console.error(`Error getting ads: ${error}`);
            throw error;
        }
    }

    /**
     * Gets all ad sets for a specific campaign
     * @param campaignId The campaign ID
     * @param onlyActive When true, returns only active ad sets
     * @returns Array of AdSet objects
     */
    private async getAdSetsForCampaign(
        campaignId: string,
        onlyActive: boolean
    ): Promise<any[]> {
        const filters = {
            campaign_id: campaignId,
            ...(onlyActive ? { effective_status: ['ACTIVE'] } : {}),
        };

        const campaign = new Campaign(campaignId);
        return campaign.getAdSets(
            ['id', 'name', 'status', 'effective_status'],
            filters
        );
    }

    /**
     * Gets all ads for a specific ad set
     * @param adSetId The ad set ID
     * @param onlyActive When true, returns only active ads
     * @returns Array of Ad objects
     */
    private async getAdsForAdSet(
        adSetId: string,
        onlyActive: boolean
    ): Promise<any[]> {
        const filters = {
            ...(onlyActive ? { effective_status: ['ACTIVE'] } : {}),
        };

        const adSet = new AdSet(adSetId);
        return adSet.getAds(
            ['id', 'name', 'status', 'effective_status'],
            filters
        );
    }

    /* Helpers */
    private validateRequiredOptions(options: { [key: string]: any }): void {
        const { appId, appSecret, accessToken, accountId } = options;
        if (!appId) throw new Error('appId is required but was not provided');
        if (!appSecret)
            throw new Error('appSecret is required but was not provided');
        if (!accessToken)
            throw new Error('accessToken is required but was not provided');
        if (!accountId)
            throw new Error('accountId is required but was not provided');
    }

    private async waitUntilVideoReady(
        video: AdVideo,
        intervalMs: number,
        timeoutMs: number
    ): Promise<void> {
        console.log(`Waiting for videoId: ${video.id} to finish processing`);
        const startTime = Date.now();

        while (true) {
            const status = await this.getVideoUploadStatus(video);
            if (status === 'ready') {
                console.log(`videoId: ${video.id} has finished processing`);
                return;
            }
            if (status !== 'processing') {
                throw new Error(`Failed. Video status: ${status}`);
            }
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(
                    `Video encoding timeout. Timeout: ${timeoutMs}`
                );
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    private async getVideoUploadStatus(video: AdVideo) {
        const url = new URL(
            `https://graph.facebook.com/v${this.apiVersion}/${video.id}`
        );

        url.searchParams.append('access_token', this.accessToken);
        url.searchParams.append('fields', 'status');

        const response = await fetch(url); // Convert URL object back to string for fetch

        const data = (await response.json()) as {
            status: { video_status: string };
        };
        return data.status['video_status'];
    }

    /**
     * Gets the creative media URL from a Facebook ad
     * @param fbAdId - The Facebook ad ID
     * @returns The media URL (video or image)
     */
    async getCreativeMediaUrl(fbAdId: string): Promise<string> {
        const FB_BASE_URL = 'https://www.facebook.com';
        try {
            // Get ad details
            const ad = new Ad(fbAdId);
            const adData = await ad.read(['creative']);

            if (!adData.creative) {
                throw new Error(`No creative found for ad ${fbAdId}`);
            }

            // Get creative details with multiple possible fields
            const creative = new AdCreative(adData.creative.id);
            const creativeData = await creative.read([
                'object_story_spec',
                'object_type',
                'object_url',
                'template_url',
                'image_url',
                'video_id',
                'body',
                'title',
                'name',
            ]);

            let rawUrl = '';

            // Check object_story_spec first (most common)
            if (creativeData.object_story_spec) {
                const spec = creativeData.object_story_spec;

                // Video ad
                if (spec.video_data?.video_id) {
                    const video = new AdVideo(spec.video_data.video_id);
                    const videoData = await video.read([
                        'source',
                        'permalink_url',
                    ]);
                    rawUrl = videoData.permalink_url || videoData.source || '';
                }
                // Image ad with hash
                else if (spec.link_data?.image_hash) {
                    const images = await this.adAccount.getAdImages(
                        ['url', 'permalink_url'],
                        { hashes: [spec.link_data.image_hash] }
                    );
                    if (images?.[0]) {
                        rawUrl = images[0].permalink_url || images[0].url || '';
                    }
                }
                // Image ad with direct URL
                else if (spec.link_data?.image_url) {
                    rawUrl = spec.link_data.image_url;
                }
                // Photo data
                else if (spec.photo_data?.url) {
                    rawUrl = spec.photo_data.url;
                }
            }

            // Fallback: Check direct video_id field
            if (!rawUrl && creativeData.video_id) {
                const video = new AdVideo(creativeData.video_id);
                const videoData = await video.read(['source', 'permalink_url']);
                rawUrl = videoData.permalink_url || videoData.source || '';
            }

            // Fallback: Check other direct fields
            if (!rawUrl) {
                rawUrl =
                    creativeData.image_url ||
                    creativeData.template_url ||
                    creativeData.object_url ||
                    '';
            }

            if (!rawUrl) {
                console.warn(
                    `No media URL found for ad ${fbAdId} with creative ${adData.creative.id}`
                );
                console.log(
                    `Creative data structure for ${fbAdId}:`,
                    creativeData
                );
                return '';
            }

            // Return absolute URL
            return rawUrl.startsWith('http')
                ? rawUrl
                : `${FB_BASE_URL}${rawUrl}`;
        } catch (error) {
            console.warn(
                `Error getting creative media URL for ad ${fbAdId}:`,
                error
            );
            return '';
        }
    }
}

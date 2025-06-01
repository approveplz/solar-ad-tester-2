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

        console.log('Initialized MetaAdCreatorService');
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

        /* Get start and end time */
        const now = new Date();

        const startTimeUnixSeconds = getNextWeekdayUnixSeconds(now).toString();

        const oneWeekLater = new Date(parseInt(startTimeUnixSeconds) * 1000);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);

        const endTimeUnixSeconds = Math.floor(
            oneWeekLater.getTime() / 1000
        ).toString();

        const createAdSetRequest: FbApiCreateAdSetRequest = {
            name,
            status,
            campaign_id: campaignId,
            bid_amount: bidAmountCents,
            bid_strategy: bidStrategy,
            start_time: startTimeUnixSeconds,
            // end_time: endTimeUnixSeconds,
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
            /* Can only have either lifetime or daily budget */
            ...(lifetimeBudgetCents && {
                // Need end time if using lifetime budget
                end_time: endTimeUnixSeconds,
                lifetime_budget: lifetimeBudgetCents,
            }),
            ...(dailyBudgetCents && {
                daily_budget: dailyBudgetCents,
            }),
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
     * using a hierarchical approach (campaign > ad set > ad)
     * @param onlyActive When true, returns only active ads; when false, returns all ads
     * @returns Array of ads with their campaign and ad set information
     */
    async getAllAdsByCampaign(onlyActive: boolean = false): Promise<
        Array<{
            campaignId: string;
            adSetId: string;
            adSetName: string;
            adId: string;
            adName: string;
            status: string;
            mediaBuyer: MediaBuyerCodes;
        }>
    > {
        console.log(
            `Getting ${onlyActive ? 'active' : 'all'} ads for account: ${
                this.accountId
            }`
        );

        try {
            // // Step 1: Get campaigns
            // const statusFilter = onlyActive
            //     ? { effective_status: ['ACTIVE'] }
            //     : {};
            // const campaigns = await this.adAccount.getCampaigns(
            //     ['id', 'name', 'status', 'effective_status'],
            //     statusFilter
            // );

            // console.log(`Retrieved ${campaigns.length} campaigns`);
            const mediaBuyerAndCampaignIds: [MediaBuyerCodes, string][] =
                Object.entries(AD_ACCOUNT_DATA[this.accountId].campaignIds).map(
                    ([key, value]) => [key as MediaBuyerCodes, value]
                );

            // Result array to store all ads with their campaign and ad set info
            const result = [];

            // Step 2: For each campaign, get its ad sets
            for (const [mediaBuyer, campaignId] of mediaBuyerAndCampaignIds) {
                const adSets = await this.getAdSetsForCampaign(
                    campaignId,
                    onlyActive
                );
                console.log(
                    `Retrieved ${adSets.length} ad sets for campaign ${campaignId}`
                );

                // Step 3: For each ad set, get its ads
                for (const adSet of adSets) {
                    const adSetId = adSet.id;
                    const adSetName = adSet._data.name;

                    const ads = await this.getAdsForAdSet(adSetId, onlyActive);

                    // Step 4: Add each ad to results with its campaign and ad set info
                    for (const ad of ads) {
                        result.push({
                            campaignId,
                            adSetId,
                            adSetName,
                            adId: ad.id,
                            adName: ad._data.name,
                            status: ad._data.effective_status,
                            mediaBuyer,
                        });
                    }
                }
            }

            console.log(
                `Retrieved a total of ${result.length} ads for account: ${this.accountId}`
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

    /*
    Use this call to search states to get key

    curl -G \
        -d 'location_types=["region"]' \
        -d 'type=adgeolocation' \
        -d 'q=california' \
        -d 'access_token=<ACCESS_TOKEN>' \
        https://graph.facebook.com/v<API_VERSION>/search
    */
}

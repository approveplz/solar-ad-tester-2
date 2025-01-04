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
    FbApiCreativeEnhancementsSpec,
    FbApiContextualMultiAdsSpec,
} from '../models/MetaApiSchema.js';
import invariant from 'tiny-invariant';
import { FbAdSettings } from '../models/FbAdSettings.js';

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
        apiVersion?: string;
    }) {
        this.validateRequiredOptions(options);

        const {
            appId,
            appSecret,
            accessToken,
            accountId,
            apiVersion = '20.0',
        } = options;

        this.appId = appId;
        this.appSecret = appSecret;
        this.accessToken = accessToken;
        this.accountId = accountId;
        this.apiVersion = apiVersion;

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
        scrapedAdArchiveId: string;
        videoFileUrl: string;
    }): Promise<AdVideo> {
        const { scrapedAdArchiveId, videoFileUrl } = params;

        console.log(`
        Uploading video to Facebook. Url: ${videoFileUrl}
        Scraped Ad Archive ID: ${scrapedAdArchiveId}
        `);

        const createAdVideoRequest: FbApiCreateAdVideoRequest = {
            name: scrapedAdArchiveId,
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
    async uploadAdImage(imageBytes: string): Promise<AdImage> {
        console.log(`Uploading image...`);

        const adImage: AdImage = await this.adAccount.createAdImage(
            [AdImage.Fields.hash, AdImage.Fields.name, AdImage.Fields.id],
            {
                // Base64 UTF-8 string
                bytes: imageBytes,
            }
        );
        return adImage;
    }

    async createAdSet(params: {
        name: string;
        campaignId: string;
        fbAdSettings: any;
    }): Promise<AdSet> {
        console.log('Creating Ad Set');
        const { name, campaignId, fbAdSettings } = params;

        const {
            promotedObjectParams: { pixelId, customEventType },
            adSetParams: {
                bidAmountCents,
                optimizationGoal,
                billingEvent,
                dailyBudgetCents,
                lifetimeBudgetCents,
                bidStrategy,
                adSetTargeting,
            },
        } = fbAdSettings;

        const targeting: FbApiAdSetTargeting = adSetTargeting;

        invariant(
            !!lifetimeBudgetCents !== !!dailyBudgetCents, // Cant both be false or both be true
            'Only include either lifetime or daily budget'
        );

        const promotedObject: PromotedObject = {
            pixel_id: pixelId,
            custom_event_type: customEventType,
        };

        /* Get start and end time */
        const now = new Date();

        // Create tomorrow's date at 00:00 UTC
        const tomorrow = new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1,
                0,
                0,
                0,
                0
            )
        );
        // Set to 4 AM PDT (11 AM UTC)
        tomorrow.setUTCHours(11);

        const oneWeekLater = new Date(tomorrow);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);

        const startTimeUnixSeconds = Math.floor(
            tomorrow.getTime() / 1000
        ).toString();

        const endTimeUnixSeconds = Math.floor(
            oneWeekLater.getTime() / 1000
        ).toString();

        const createAdSetRequest: FbApiCreateAdSetRequest = {
            name,
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
                {
                    event_type: 'VIEW_THROUGH',
                    window_days: 1,
                },
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

    async createAdCreative(
        name: string,
        video: AdVideo,
        imageUrl: string,
        fbAdSettings: FbAdSettings,
        adType?: string
    ): Promise<AdCreative> {
        // const { name, video, imageUrl, fbAdSettings, adType } = params;
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

        const objectStorySpec: FbApiAdCreativeObjStorySpec = {
            page_id: pageId,
            // instagram_actor_id: instagramActorId,
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

        // Need this to opt out of Ad Creative+
        const degreesOfFreedomSpec: FbApiCreativeEnhancementsSpec = {
            creative_features_spec: {
                standard_enhancements: {
                    enroll_status: 'OPT_OUT',
                },
            },
        };

        // Need to opt out of Contextual Multi Ads
        const contextualMultiAdsSpec: FbApiContextualMultiAdsSpec = {
            enroll_status: 'OPT_OUT',
        };

        const urlTags = urlTrackingTags;
        invariant(urlTags, 'url tracking tags can not be empty');

        const createAdCreativeRequest: FbApiCreateAdCreativeRequest = {
            name,
            object_story_spec: objectStorySpec,
            degrees_of_freedom_spec: degreesOfFreedomSpec,
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

    async createAdCreativeImage(
        name: string,
        adImage: AdImage,
        fbAdSettings: FbAdSettings,
        adType?: string
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

        // Need this to opt out of Ad Creative+
        const degreesOfFreedomSpec: FbApiCreativeEnhancementsSpec = {
            creative_features_spec: {
                standard_enhancements: {
                    enroll_status: 'OPT_OUT',
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
            degrees_of_freedom_spec: degreesOfFreedomSpec,
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
        const {
            name,
            adSet,
            adCreative,
        }: {
            name: string;
            adSet: AdSet;
            adCreative: AdCreative;
        } = params;

        const createAdRequest: FbApiCreateAdRequest = {
            name,
            adset_id: adSet.id,
            creative: { creative_id: adCreative.id },
            status: 'ACTIVE',
        };

        const ad: Ad = await this.adAccount.createAd([], createAdRequest);

        console.log(`Created Facebook Ad. Ad ID: ${ad.id}`);

        return ad;
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

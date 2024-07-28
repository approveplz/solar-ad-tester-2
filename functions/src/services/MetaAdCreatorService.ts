import {
    FacebookAdsApi,
    AdAccount,
    //@ts-ignore
    AdCreative,
    //@ts-ignore
    AdSet,
    //@ts-ignore
    Ad,
    //@ts-ignore
    AdVideo,
    Campaign,
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
} from '../models/IMetaAdCreatorService';
import { ParsedFbAdInfo } from '../models/ParsedFbAdInfo';
import { CreatedFbAdInfo } from '../models/CreatedFbAdInfo';

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

        FacebookAdsApi.init(accessToken);

        this.adAccount = new AdAccount(`act_${this.accountId}`);

        console.log('Initialized FacebookAdsCreatorService');
    }

    async createVideoAdAndAddToCampaign(params: {
        campaign: Campaign;
        scrapedAd: ParsedFbAdInfo;
    }): Promise<{
        scrapedAdInfo: ParsedFbAdInfo;
        createdFbAdInfo: CreatedFbAdInfo;
    }> {
        const {
            campaign,
            scrapedAd,
        }: {
            campaign: Campaign;
            scrapedAd: ParsedFbAdInfo;
        } = params;
        const scrapedAdCreativeId = scrapedAd.adCreativeId;

        const adVideo: AdVideo = await this.uploadAdVideo({
            scrapedAdCreativeId,
            videoFileUrl: scrapedAd.videoHdUrl,
        });

        // Create Ad Set
        const now = new Date();
        const nowUnixMs = now.getTime();

        // For testing
        const sixMonthLaterUnixSeconds = Math.floor(
            (nowUnixMs + 1000 * 60 * 60 * 24 * 30 * 6) / 1000
        );
        const sevenMonthsLaterUnixSeconds = Math.floor(
            (nowUnixMs + 1000 * 60 * 60 * 24 * 30 * 7) / 1000
        );

        // const oneHourLaterUnixSeconds = Math.floor(
        //     (nowUnixMs + 1000 * 60 * 60) / 1000
        // );

        // const oneWeekLaterUnixSeconds = Math.floor(
        //     (nowUnixMs + 1000 * 60 * 60 * 24 * 7) / 1000
        // );

        const createAdSetParams = {
            name: `ScrapedAdCreativeId-${scrapedAdCreativeId}`,
            campaignId: campaign.id,
            bidAmountCents: '200',
            startTimeUnixSeconds: sixMonthLaterUnixSeconds.toString(),
            endTimeUnixSeconds: sevenMonthsLaterUnixSeconds.toString(),
            states: ['CA', 'NV'],
            dailyBudgetCents: '2000',
            // lifetimeBudgetCents: '3100',
        };

        const adSet: AdSet = await this.createAdSet(createAdSetParams);

        // Create Ad Creative
        // TODO: update page id and instagram id
        const adCreative: AdCreative = await this.createAdCreative({
            name: `${scrapedAdCreativeId}-Creative`,
            video: adVideo,
            imageUrl: scrapedAd.videoPreviewImageUrl,
            pageId: '399061289952685',
            instagramActorId: '6728233840571130',
        });

        // Create Ad from Ad Set and Ad Creative
        const ad: Ad = await this.createAd({
            name: `${scrapedAdCreativeId}-Ad`,
            adSet,
            adCreative,
        });

        // Save into Firestore
        const createdFbAdInfo: CreatedFbAdInfo = {
            campaignId: campaign.id,
            adSetId: adSet.id,
            creativeId: adCreative.id,
            videoId: adVideo.id,
            adId: ad.id,
        };

        console.log(
            `Finished creating facebook Ad for scraped Ad Creative ID: ${scrapedAdCreativeId}`
        );

        return {
            scrapedAdInfo: scrapedAd,
            createdFbAdInfo,
        };
    }

    async createCampaign(params: { name: string }): Promise<Campaign> {
        const { name } = params;
        console.log(`Creating Facebook Ad campaign. Name: ${name}`);

        const createCampaignRequest: FbApiCreateCampaignRequest = {
            name,
            objective: 'OUTCOME_LEADS',
            special_ad_categories: [],
            status: 'PAUSED',
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

    private async uploadAdVideo(params: {
        scrapedAdCreativeId: string;
        videoFileUrl: string;
    }): Promise<AdVideo> {
        const { scrapedAdCreativeId, videoFileUrl } = params;

        console.log(`
        Uploading video to Facebook. Url: ${videoFileUrl}
        Scraped Ad Creative ID: ${scrapedAdCreativeId}
        `);

        const createAdVideoRequest: FbApiCreateAdVideoRequest = {
            name: scrapedAdCreativeId,
            file_url: videoFileUrl,
        };

        const adVideo: AdVideo = await this.adAccount.createAdVideo(
            [],
            createAdVideoRequest
        );

        await this.waitUntilVideoReady(adVideo, 10000, 60000);

        console.log(
            `Video uploaded to Facebook. Url: ${videoFileUrl}. ID: ${adVideo.id}`
        );
        return adVideo;
    }

    private async createAdSet(params: {
        name: string;
        campaignId: string;
        bidAmountCents: string;
        startTimeUnixSeconds: string;
        endTimeUnixSeconds: string;
        states: string[];
        dailyBudgetCents?: string;
        lifetimeBudgetCents?: string;
    }): Promise<AdSet> {
        const {
            name,
            campaignId,
            bidAmountCents,
            startTimeUnixSeconds,
            endTimeUnixSeconds,
            states,
            lifetimeBudgetCents,
            dailyBudgetCents,
        } = params;

        const targeting: FbApiAdSetTargeting = this.getAdSetTargeting({
            states,
        });

        // const bidStrategy = 'COST_CAP';
        const bidStrategy = 'LOWEST_COST_WITH_BID_CAP';

        //LEAD_GENERATION?
        // const optimizationGoal = 'OFFSITE_CONVERSIONS';
        // TODO: remove after testing
        const optimizationGoal = 'IMPRESSIONS';

        const billingEvent = 'IMPRESSIONS';

        // @ts-ignore
        const promotedObject: PromotedObject = {
            pixel_id: '700671091822152',
            custom_event_type: 'LEAD',
        };

        const createAdSetRequest: FbApiCreateAdSetRequest = {
            name,
            campaign_id: campaignId,
            bid_amount: bidAmountCents,
            bid_strategy: bidStrategy,
            start_time: startTimeUnixSeconds,
            end_time: endTimeUnixSeconds,
            optimization_goal: optimizationGoal,
            status: 'PAUSED',
            targeting,
            lifetime_budget: lifetimeBudgetCents,
            daily_budget: dailyBudgetCents,
            billing_event: billingEvent,
            // promoted_object: promotedObject,
            is_dynamic_creative: false,
        };

        const adSet: AdSet = await this.adAccount.createAdSet(
            [],
            createAdSetRequest
        );

        console.log(`AdSet created. ID: ${adSet.id}`);

        return adSet;
    }

    private async createAdCreative(params: {
        name: string;
        video: AdVideo;
        imageUrl: string;
        pageId: string;
        instagramActorId: string;
    }): Promise<AdCreative> {
        // @ts-ignore
        const { name, video, imageUrl, pageId, instagramActorId } = params;
        console.log(`Creating Ad Creative. Name: ${name}`);
        try {
            const objectStorySpec: FbApiAdCreativeObjStorySpec = {
                page_id: pageId,
                // instagram_actor_id: instagramActorId,
                video_data: {
                    video_id: video.id,
                    title: 'ad title',
                    message: 'ad message',
                    link_description: 'link description',
                    call_to_action: {
                        type: 'LEARN_MORE',
                        value: {
                            link: 'https://www.greenenergycollective.org/survey/no-cost-solar',
                        },
                    },
                    image_url: imageUrl,
                },
            };

            // Need this to opt out of Ad Creative+
            const degreesOfFreedomSpec = {
                creative_features_spec: {
                    standard_enhancements: {
                        enroll_status: 'OPT_OUT',
                    },
                },
            };

            // Fetch the latest 'name' property of the ad account from the API. Even though we already have an AdAccount object,
            // it may not contain up-to-date properties until we explicitly fetch them using the .get() method with the specific fields.
            const adAccountName = ((await this.adAccount.get(['name'])) as any)
                .name;

            const urlTagParams = {
                sid: '27',
                adAccountName,
                tier: '1',
                lpCampaignId: '62380e9f4e1b7',
                lpCampaignKey: 'MtxpPBkJcNbfKXV7HhCG',
            };
            const urlTags = this.getTrackingUrlTags(urlTagParams);

            const adCreative: AdCreative =
                await this.adAccount.createAdCreative([], {
                    name,
                    object_story_spec: objectStorySpec,
                    degrees_of_freedom_spec: degreesOfFreedomSpec,
                    url_tags: urlTags,
                });

            console.log(`Created Ad Creative. Creative ID: ${adCreative.id}`);
            return adCreative;
        } catch (e) {
            const originalError = e as Error;
            console.error(originalError);
            const enhancedError = new Error('Error creating Ad Creative');
            enhancedError.stack = originalError?.stack;
            enhancedError.cause = originalError;
            throw enhancedError;
        }
    }

    private async createAd(params: {
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
            status: 'PAUSED',
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
        const startTime = new Date().getTime();
        let status = '';

        while (true) {
            status = await this.getVideoUploadStatus(video);
            if (status != 'processing') {
                break;
            } else if (startTime + timeoutMs <= new Date().getTime()) {
                throw Error(`Video encoding timeout. Timeout: ${timeoutMs}`);
            }

            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        if (status != 'ready') {
            throw Error(`Failed. Video status: ${status}`);
        }
        console.log(`videoId: ${video.id} has finished processing`);
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

    private getTrackingUrlTags(params: {
        sid: string;
        adAccountName: string;
        tier: string;
        lpCampaignId: string;
        lpCampaignKey: string;
    }): string {
        const { sid, adAccountName, tier, lpCampaignId, lpCampaignKey } =
            params;
        return (
            `sid=${sid}` +
            `&ad_name={{ad.name}}` +
            `&ad_campaign_name={{campaign.name}}` +
            `&ad_group_name={{adset.name}}` +
            `&ad_campaign_id={{campaign.id}}` +
            `&ad_group_id={{adset.id}}` +
            `&ad_id={{ad.id}}` +
            `&ad_platform=facebook` +
            `&ad_account_name=${adAccountName}` +
            `&utm_campaign={{campaign.name}}` +
            `&utm_source=${adAccountName}` +
            `&utm_medium=facebook` +
            `&utm_content={{ad.name}}` +
            `&utm_term={{adset.name}}` +
            `&supplier_name=${adAccountName}` +
            `&tier=${tier}` +
            `&lp_campaign_id=${lpCampaignId}` +
            `&lp_campaign_key=${lpCampaignKey}`
        );
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
    private getAdSetTargeting({
        states,
    }: {
        states: string[];
    }): FbApiAdSetTargeting {
        const ageMax = 65;
        const ageMin = 25;

        // Get Regions
        const stateToKeyMap: { [key: string]: string } = {
            CA: '3847',
            NV: '3871',
        };
        const regions = [];
        for (const state of states) {
            const stateKey = stateToKeyMap[state];
            if (!stateKey) {
                throw new Error(`Key for state: ${state} not found in mapping`);
            }
            regions.push({ key: stateKey });
        }

        // Excluded Custom Audiences
        //@ts-ignore
        const excludedCustomAudiences = [
            { id: '23858391887150107' },
            { id: '120205719496640108' },
            { id: '120205719515740108' },
        ];

        const targeting: FbApiAdSetTargeting = {
            age_max: ageMax,
            age_min: ageMin,
            // excluded_custom_audiences: excludedCustomAudiences,
            geo_locations: {
                regions,
            },
            // Turn on advantage+ audience
            targeting_automation: {
                advantage_audience: 1,
            },
        };

        return targeting;
    }
}

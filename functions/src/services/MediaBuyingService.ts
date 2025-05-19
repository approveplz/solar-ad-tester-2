import { FbAdSettings } from '../models/FbAdSettings.js';
import { Ad, AdCreative, AdSet, AdVideo } from 'facebook-nodejs-business-sdk';
import MetaAdCreatorService from './MetaAdCreatorService.js';
import {
    BigQueryService,
    AdPerformanceDataBigQuery,
} from './BigQueryService.js';
import { CreatomateMetadata, CreatomateService } from './CreatomateService.js';
import { AdPerformance, PerformanceMetrics } from '../models/AdPerformance.js';
import {
    getAdPerformanceFirestoreAll,
    saveAdPerformanceFirestore,
    getEventFirestoreDocRef,
    setEventFirestore,
    getFbAdSettingFirestore,
} from '../firestoreCloud.js';
import { invariant } from '../helpers.js';
import { TelegramService } from './TelegramService.js';
import { TrelloService } from './TrelloService.js';
import { getAdName, getNextWeekdayUnixSeconds } from '../helpers.js';
import { ZipcodeObj } from './ZipcodeService.js';
import { ZipcodeService } from './ZipcodeService.js';
import { FbApiAdSetTargeting } from '../models/MetaApiSchema.js';
import { downloadFileFromStorage } from '../firebaseStorageCloud.js';
import { FbApiGeoLocations } from '../models/MetaApiSchema.js';
import { AD_ACCOUNT_DATA } from '../adAccountConfig.js';

export class MediaBuyingService {
    private metAdCreatorServices: Record<string, MetaAdCreatorService> = {};
    private LIFETIME_SPEND_THRESHOLD = 40;
    private LIFETIME_ROI_SCALING_THRESHOLD = 1.5;
    private LIFETIME_ROI_HOOK_THRESHOLD = 1.3;
    private LIFETIME_TRELLO_CARD_CREATION_THRESHOLD = 1.3;

    constructor(
        private readonly creatomateService: CreatomateService,
        private readonly bigQueryService: BigQueryService,
        private readonly telegramService: TelegramService,
        private readonly trelloService: TrelloService
    ) {}

    async getAdsForAccountId(
        accountId: string,
        onlyActive: boolean = true
    ): Promise<number> {
        console.log(
            `Fetching ${
                onlyActive ? 'active' : 'all'
            } ads for account ID: ${accountId}`
        );

        // Get all ad performances from Firestore
        const adPerformances = await getAdPerformanceFirestoreAll();
        const existingAdIds = new Set(adPerformances.map((ad) => ad.fbAdId));

        console.log(
            `Retrieved ${adPerformances.length} ad performances from Firestore`
        );

        // Get all active ads from Meta
        const metaAdCreatorService = await this.getMetaAdCreatorService(
            accountId
        );

        const ads = await metaAdCreatorService.getAllAdsByCampaign(onlyActive);
        console.log(
            `Successfully retrieved ${ads.length} active ads from Meta for account ID: ${accountId}`
        );

        // Initialize ads that exist in Meta but not in Firestore
        const newAds = [];
        for (const ad of ads) {
            if (!existingAdIds.has(ad.adId)) {
                console.log(
                    `Initializing new ad in Firestore: ${ad.adId}, name: ${ad.adName}`
                );

                const adPerformance: AdPerformance = {
                    fbAccountId: accountId,
                    adName: ad.adName || '',
                    gDriveDownloadUrl: '',
                    fbAdId: ad.adId,
                    fbAdSetId: ad.adSetId,
                    fbCampaignId: ad.campaignId,
                    vertical: AD_ACCOUNT_DATA[accountId].type,
                    ideaWriter: '',
                    scriptWriter: '',
                    hookWriter: '',
                    performanceMetrics: {},
                    fbIsActive: true,
                    mediaBuyer: ad.mediaBuyer,
                };

                await saveAdPerformanceFirestore(ad.adId, adPerformance);
                newAds.push(adPerformance);
            }
        }

        console.log(
            `Successfully processed ads for account ID: ${accountId}. Created ${newAds.length} new entries in Firestore.`
        );

        return newAds.length;
    }

    async handleAdPerformanceUpdates() {
        const [
            bqPerformanceLast3Days,
            bqPerformanceLast7Days,
            bqPerformanceLifetime,
            firestoreAdPerformances,
        ] = await Promise.all([
            this.bigQueryService.getAdPerformance('AD_PERFORMANCE_3D'),
            this.bigQueryService.getAdPerformance('AD_PERFORMANCE_7D'),
            this.bigQueryService.getAdPerformance('AD_PERFORMANCE_LIFETIME'),
            getAdPerformanceFirestoreAll(),
        ]);

        for (const adPerformance of firestoreAdPerformances) {
            console.log('Processing ad performance:', adPerformance.fbAdId);
            await this.processSingleAdPerformance(
                adPerformance,
                bqPerformanceLast3Days,
                bqPerformanceLast7Days,
                bqPerformanceLifetime
            );
        }
    }

    private async processSingleAdPerformance(
        adPerformance: AdPerformance,
        bqMetrics3d: AdPerformanceDataBigQuery[],
        bqMetrics7d: AdPerformanceDataBigQuery[],
        bqMetricsLifetime: AdPerformanceDataBigQuery[]
    ) {
        const fbAdId = adPerformance.fbAdId;

        console.log(
            `Processing ad - ID: ${fbAdId}, Name: ${
                adPerformance.adName
            }, Active Status: ${
                adPerformance.fbIsActive ? 'Active' : 'Inactive'
            }`
        );

        if (!adPerformance.fbIsActive) {
            console.log(
                `Ad ${adPerformance.fbAdId} is not active, skipping processing`
            );
            return;
        }
        console.log(`Processing active ad ${adPerformance.fbAdId}`);

        adPerformance.performanceMetrics = this.buildPerformanceMetrics(
            fbAdId,
            bqMetrics3d,
            bqMetrics7d,
            bqMetricsLifetime
        );

        await saveAdPerformanceFirestore(adPerformance.fbAdId, adPerformance);

        const fbLifetimeSpend =
            adPerformance.performanceMetrics.fb?.lifetime?.spend ?? 0;
        if (fbLifetimeSpend < this.LIFETIME_SPEND_THRESHOLD) {
            console.log(
                `Ad ${fbAdId} below spend threshold. Spend: ${fbLifetimeSpend}`
            );
            return;
        }

        const fbAccountId = adPerformance.fbAccountId;
        invariant(fbAccountId, 'fbAccountId must be defined');

        const metaService = await this.getMetaAdCreatorService(fbAccountId);
        await this.handlePerformanceBasedActions(
            adPerformance,
            metaService,
            this.telegramService,
            this.trelloService
        );
    }

    async handlePerformanceBasedActions(
        adPerformance: AdPerformance,
        metaAdCreatorService: MetaAdCreatorService,
        telegramService: TelegramService,
        trelloService: TrelloService
    ) {
        const mediaBuyer = adPerformance.mediaBuyer;
        invariant(mediaBuyer, 'mediaBuyer must be defined');

        const fbRoiLifetime =
            adPerformance.performanceMetrics.fb?.lifetime?.roi ?? 0;
        const fbRoiLast3Days =
            adPerformance.performanceMetrics.fb?.last3Days?.roi ?? 0;

        const leadsLifetime =
            adPerformance.performanceMetrics.fb?.lifetime?.leads ?? 0;

        // Underperforming ad
        if (fbRoiLifetime < 1 || fbRoiLast3Days < 1) {
            const message = `
Consider pausing this ad because the ROI was under 1.00X

${this.createMessageWithAdPerformanceInfo(adPerformance)}`;

            await telegramService.sendMessage(
                telegramService.mediaBuyerChatIds[mediaBuyer],
                message
            );
            // TODO: Remove this after testing
            await telegramService.sendMessage(
                telegramService.mediaBuyerChatIds['AZ'],
                message
            );
            return;
        }

        // Let ad run because its profitable, but dont create hooks, tello card, or scale.
        if (
            fbRoiLifetime < this.LIFETIME_ROI_SCALING_THRESHOLD &&
            leadsLifetime > 1
        ) {
            console.log(
                `Ad ${
                    adPerformance.fbAdId
                } in profitable range (ROI: ${fbRoiLifetime.toFixed(
                    2
                )}). But do not create hooks, tello card, or scale`
            );
            return;
        }
    }

    private createMessageWithAdPerformanceInfo(
        adPerformance: AdPerformance
    ): string {
        const lifetimeMetrics = adPerformance.performanceMetrics.fb?.lifetime;
        const last3DaysMetrics = adPerformance.performanceMetrics.fb?.last3Days;
        return `
Ad Name: ${adPerformance.adName}
Ad ID: ${adPerformance.fbAdId}
Ad Set ID: ${adPerformance.fbAdSetId}
Campaign ID: ${adPerformance.fbCampaignId}

Last 3 Days:
ROI: ${last3DaysMetrics?.roi.toFixed(2) ?? 'N/A'}
Spend: $${(last3DaysMetrics?.spend ?? 0).toFixed(2)}
Revenue: $${(last3DaysMetrics?.revenue ?? 0).toFixed(2)}

Lifetime:
ROI: ${lifetimeMetrics?.roi.toFixed(2) ?? 'N/A'}
Spend: $${(lifetimeMetrics?.spend ?? 0).toFixed(2)}
Revenue: $${(lifetimeMetrics?.revenue ?? 0).toFixed(2)}
`;
    }

    private async pauseUnderperformingAd(
        adPerformance: AdPerformance,
        metaAdCreatorService: MetaAdCreatorService
    ) {
        await metaAdCreatorService.updateAdSetStatus(
            adPerformance.fbAdSetId,
            'PAUSED'
        );
        adPerformance.fbIsActive = false;
        await saveAdPerformanceFirestore(adPerformance.fbAdId, adPerformance);
    }

    public async getFbAdSettings(fbAccountId: string) {
        // Account ID determines if ad type is O or R
        const fbAdSettings: FbAdSettings | null = await getFbAdSettingFirestore(
            fbAccountId
        );
        if (fbAdSettings) {
            invariant(
                fbAdSettings.adSetParams.adSetTargeting,
                'adSetTargeting must exist'
            );

            const { age_max, age_min, genders, geo_locations } =
                fbAdSettings.adSetParams.adSetTargeting;

            // Get the base targeting from AD_ACCOUNT_DATA
            const baseTargeting =
                AD_ACCOUNT_DATA[fbAccountId as keyof typeof AD_ACCOUNT_DATA]
                    .targeting;

            // Create merged geo_locations and conditionally adding zips
            const mergedGeoLocations = {
                ...baseTargeting.geo_locations,
                ...(geo_locations && {
                    ...geo_locations,
                    // Only add zips if they exist in the Firestore settings
                    ...(geo_locations.zips && { zips: geo_locations.zips }),
                }),
            };

            const targeting: FbApiAdSetTargeting = {
                ...baseTargeting,
                geo_locations: mergedGeoLocations,
                age_max,
                age_min,
                genders,
            };

            invariant(
                targeting.geo_locations,
                'geo_locations must exist in targeting'
            );

            fbAdSettings.adSetParams.adSetTargeting = targeting;
        } else {
            throw new Error(
                `No ad settings found for accountId: ${fbAccountId}`
            );
        }

        console.log(
            `fbAdSettings for ${fbAccountId}`,
            JSON.stringify(fbAdSettings, null, 2)
        );

        return fbAdSettings;
    }

    public async handleCreateAd(
        metaAdCreatorService: MetaAdCreatorService,
        fbAccountId: string,
        campaignId: string,
        videoUuid: string,
        videoFileUrl: string,
        thumbnailFilePath: string = ''
    ): Promise<Ad> {
        const adSetNameAndAdName = `${videoUuid}`;
        const fbAdSettings = await this.getFbAdSettings(fbAccountId);

        const adSet: AdSet = await metaAdCreatorService.createAdSet({
            name: adSetNameAndAdName,
            campaignId,
            fbAdSettings,
        });

        // Create Ad Video
        const adVideo: AdVideo = await metaAdCreatorService.uploadAdVideo({
            adName: videoUuid,
            videoFileUrl,
        });

        // Use Facebook generated thumbnail
        const videoObject = await adVideo.read(['picture']);
        const fbGeneratedThumbnailUrl = videoObject.picture;

        const adCreative: AdCreative =
            await metaAdCreatorService.createAdCreative(
                `Creative-${adSetNameAndAdName}`,
                adVideo,
                thumbnailFilePath || fbGeneratedThumbnailUrl,
                fbAdSettings
            );

        const ad: Ad = await metaAdCreatorService.createAd({
            name: adSetNameAndAdName,
            adSet,
            adCreative,
        });

        return new Ad(ad.id);
    }

    private async duplicateAdSetAndAdToCampaignWithUpdates(
        fbAdId: string,
        scalingCampaignId: string,
        dailyBudgetCents: number,
        metaService: MetaAdCreatorService
    ) {
        const adSetId = await metaService.getAdSetIdFromAdId(fbAdId);
        const nextWeekdayUnixSeconds = getNextWeekdayUnixSeconds().toString();
        const duplicatedAdSet = await metaService.duplicateAdSet(
            adSetId,
            scalingCampaignId,
            nextWeekdayUnixSeconds
        );
        console.log(
            `Successfully duplicated ad set ${adSetId} to campaign ${scalingCampaignId}`
        );

        const updateParams = {
            daily_budget: dailyBudgetCents,
        };

        await duplicatedAdSet.update([], updateParams);
        console.log(
            `Successfully updated daily budget for ad set ${adSetId} to ${dailyBudgetCents}`
        );
        return duplicatedAdSet;
    }

    private buildPerformanceMetrics(
        fbAdId: string,
        bqMetrics3d?: AdPerformanceDataBigQuery[],
        bqMetrics7d?: AdPerformanceDataBigQuery[],
        bqMetricsLifetime?: AdPerformanceDataBigQuery[]
    ): PerformanceMetrics {
        const fbMetrics3d = bqMetrics3d?.find(
            (m) => m.Platform === 'FB' && m.AdID === fbAdId
        );
        const fbMetrics7d = bqMetrics7d?.find(
            (m) => m.Platform === 'FB' && m.AdID === fbAdId
        );
        const fbMetricsLifetime = bqMetricsLifetime?.find(
            (m) => m.Platform === 'FB' && m.AdID === fbAdId
        );
        const costPerLead3d =
            (fbMetrics3d?.total_cost || 0) / (fbMetrics3d?.leads || 0);
        const costPerLead7d =
            (fbMetrics7d?.total_cost || 0) / (fbMetrics7d?.leads || 0);
        const costPerLeadLifetime =
            (fbMetricsLifetime?.total_cost || 0) /
            (fbMetricsLifetime?.leads || 0);

        return {
            fb: {
                last3Days: {
                    spend: fbMetrics3d?.total_cost ?? 0,
                    revenue: fbMetrics3d?.total_revenue ?? 0,
                    roi: fbMetrics3d?.ROI ?? 0,
                    leads: fbMetrics3d?.leads ?? 0,
                    clicks: fbMetrics3d?.total_clicks ?? 0,
                    costPerLead: costPerLead3d,
                },
                last7Days: {
                    spend: fbMetrics7d?.total_cost ?? 0,
                    revenue: fbMetrics7d?.total_revenue ?? 0,
                    roi: fbMetrics7d?.ROI ?? 0,
                    leads: fbMetrics7d?.leads ?? 0,
                    clicks: fbMetrics7d?.total_clicks ?? 0,
                    costPerLead: costPerLead7d,
                },
                lifetime: {
                    spend: fbMetricsLifetime?.total_cost ?? 0,
                    revenue: fbMetricsLifetime?.total_revenue ?? 0,
                    roi: fbMetricsLifetime?.ROI ?? 0,
                    leads: fbMetricsLifetime?.leads ?? 0,
                    clicks: fbMetricsLifetime?.total_clicks ?? 0,
                    costPerLead: costPerLeadLifetime,
                },
            },
        };
    }

    private async getMetaAdCreatorService(accountId: string) {
        if (!this.metAdCreatorServices[accountId]) {
            this.metAdCreatorServices[accountId] = new MetaAdCreatorService({
                appId: process.env.FACEBOOK_APP_ID || '',
                appSecret: process.env.FACEBOOK_APP_SECRET || '',
                accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
                accountId,
            });
        }
        return this.metAdCreatorServices[accountId];
    }
}

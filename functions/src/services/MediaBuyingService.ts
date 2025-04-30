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
import invariant from 'tiny-invariant';
import { SkypeService } from './SkypeService.js';
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
        private readonly skypeService: SkypeService,
        private readonly trelloService: TrelloService
    ) {}

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
            this.skypeService,
            this.trelloService
        );
    }

    async handlePerformanceBasedActions(
        adPerformance: AdPerformance,
        metaAdCreatorService: MetaAdCreatorService,
        skypeService: SkypeService,
        trelloService: TrelloService
    ) {
        let mediaBuyer: string;
        if (adPerformance.fbAccountId === '8653880687969127') {
            mediaBuyer = 'MA';
        } else {
            mediaBuyer = 'AZ';
        }

        const fbRoiLifetime =
            adPerformance.performanceMetrics.fb?.lifetime?.roi ?? 0;
        const fbRoiLast3Days =
            adPerformance.performanceMetrics.fb?.last3Days?.roi ?? 0;

        const leadsLifetime =
            adPerformance.performanceMetrics.fb?.lifetime?.leads ?? 0;

        if (adPerformance.hasScaled) {
            console.log(
                `Ad ${adPerformance.fbAdId} has already been scaled, skipping processing`
            );
            return;
        }

        // Pause underperforming ad.
        if (fbRoiLifetime < 1 || fbRoiLast3Days < 1) {
            await this.pauseUnderperformingAd(
                adPerformance,
                metaAdCreatorService
            );
            const message = `
I've paused your ad because the ROI was under 1.00X
            
This is the ad that I've paused:
${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}`;
            await skypeService.sendMessage(mediaBuyer, message);
            return;
        }

        // Let ad run because its profitable, but dont create hooks, tello card, or scale.
        if (
            fbRoiLifetime < this.LIFETIME_ROI_HOOK_THRESHOLD &&
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

        // Ad above threshold to create a Trello card. Create one if one has not been created yet and its not a hook.
        if (
            fbRoiLifetime >= this.LIFETIME_TRELLO_CARD_CREATION_THRESHOLD &&
            !adPerformance.isHook &&
            !adPerformance.hasTrelloCardCreated
        ) {
            const trelloCard = await this.handleCreateTrelloCard(
                adPerformance,
                trelloService
            );
            const message = `
I've created a new Trello card on the Adstonaut board for your ad because the ROI was over ${
                this.LIFETIME_TRELLO_CARD_CREATION_THRESHOLD
            }x

This is the ad that I've created the card for:
${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}`;
            await skypeService.sendMessage(mediaBuyer, message);
        }

        // TODO: Add hooks creation back in.
        //         // Ad above threshold to create hooks. Create hooks if not yet created and its not a hook.
        //         if (!adPerformance.hasHooksCreated && !adPerformance.isHook) {
        //             try {
        //                 const hookAdPerformances = await this.handleCreateHooks(
        //                     adPerformance,
        //                     metaAdCreatorService
        //                 );
        //                 const message = `
        // I've created hooks for your ad because the ROI was over ${
        //                     this.LIFETIME_ROI_HOOK_THRESHOLD
        //                 }x

        // This is the ad that I've created hooks for:
        // ${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}

        // These are the hooks that I've created:
        // ${hookAdPerformances
        //     .map((hook) => skypeService.createMessageWithAdPerformanceInfo(hook, false))
        //     .join('')} `;

        //                 await skypeService.sendMessage(mediaBuyer, message);
        //             } catch (error) {
        //                 console.error(
        //                     `Failed to create hooks for ad ${adPerformance.fbAdId}:`,
        //                     error
        //                 );
        //             }
        //         }

        // TODO: Add scaling back in.
        // Ad above threshold to scale. Scale if not yet scaled.
        //         if (
        //             fbRoiLifetime >= this.LIFETIME_ROI_SCALING_THRESHOLD &&
        //             !adPerformance.hasScaled &&
        //             leadsLifetime >= 3
        //         ) {
        //             const scaledAdDailyBudgetCents = 20000;
        //             const scaledAdPerformance = await this.handleScaling(
        //                 adPerformance,
        //                 metaAdCreatorService,
        //                 scaledAdDailyBudgetCents
        //             );

        //             const message = `
        // I've scaled your ad for you because the ROI was over ${
        //                 this.LIFETIME_ROI_SCALING_THRESHOLD
        //             }x

        // This is the original ad that I've scaled:
        // ${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}

        // This is the scaled ad that I've created for you with a daily budget of $${(
        //                 scaledAdDailyBudgetCents / 100
        //             ).toFixed(2)}:
        // ${skypeService.createMessageWithAdPerformanceInfo(scaledAdPerformance, false)}

        // It will start running the next weekday.`;

        //             await skypeService.sendMessage(mediaBuyer, message);
        //         }
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

    async handleCreateTrelloCard(
        originalAdPerformance: AdPerformance,
        trelloService: TrelloService
    ) {
        const quantity = 5;
        const cardName = trelloService.getCardName(
            'Roofing', // TODO: make this dynamic
            originalAdPerformance.adName,
            quantity
        );
        const trelloCard =
            await trelloService.createCardFromRoofingTemplateWithVideoUrl(
                cardName,
                originalAdPerformance.gDriveDownloadUrl,
                5
            );
        originalAdPerformance.hasTrelloCardCreated = true;
        await saveAdPerformanceFirestore(
            originalAdPerformance.fbAdId,
            originalAdPerformance
        );
        return trelloCard;
    }

    async handleCreateHooks(
        originalAdPerformance: AdPerformance,
        metaAdCreatorService: MetaAdCreatorService
    ): Promise<AdPerformance[]> {
        const creatomateRenderResponses =
            await this.creatomateService.uploadToCreatomateWithHooksAll(
                originalAdPerformance.gDriveDownloadUrl,
                originalAdPerformance.adName,
                originalAdPerformance.fbAdId
            );

        const renderCompleteData = await Promise.all(
            creatomateRenderResponses.map(async (renderResponse) => {
                const { creatomateRenderResponse } = renderResponse;

                const eventKey = `creatomate_render:${creatomateRenderResponse.id}`;

                try {
                    await setEventFirestore(eventKey, 'PENDING', {});
                    console.log(
                        `Event ${eventKey} created with status: PENDING`
                    );
                } catch (err) {
                    console.error(`Failed to create event ${eventKey}:`, err);
                    throw err;
                }

                // Now obtain the document reference.
                const eventDocRef = await getEventFirestoreDocRef(eventKey);
                console.log(
                    `Got document reference for event key: ${eventKey}`
                );

                // Return a promise that just attaches the snapshot listener.
                return new Promise<{
                    creatomateMetadata: CreatomateMetadata;
                    creatomateUrl: string;
                }>((resolve, reject) => {
                    const unsubscribe = eventDocRef.onSnapshot(
                        (snapshot) => {
                            console.log('onSnapshot triggered', {
                                exists: snapshot.exists,
                                data: snapshot.data(),
                            });

                            if (snapshot.exists) {
                                const data = snapshot.data();
                                if (data && data.status === 'SUCCESS') {
                                    console.log(
                                        'Received SUCCESS status with data:',
                                        data
                                    );
                                    clearTimeout(timeout);
                                    unsubscribe();
                                    resolve({
                                        creatomateMetadata:
                                            data.payload.creatomateMetadata,
                                        creatomateUrl:
                                            data.payload.creatomateUrl,
                                    });
                                }
                            }
                        },
                        (err) => {
                            console.error('Error in onSnapshot:', err);
                            clearTimeout(timeout);
                            unsubscribe();
                            reject(err);
                        }
                    );

                    // Set a timeout to reject after 5 minutes if the event is not updated.
                    const timeout = setTimeout(() => {
                        console.error(
                            `Timeout waiting for Creatomate render event: ${creatomateRenderResponse.id}`
                        );
                        unsubscribe();
                        reject(
                            new Error(
                                `Timeout waiting for Creatomate render event: ${creatomateRenderResponse.id}`
                            )
                        );
                    }, 5 * 60 * 1000);
                });
            })
        );

        const createHookPromises = renderCompleteData.map(
            async ({ creatomateMetadata, creatomateUrl }) => {
                console.log({ creatomateMetadata });
                const { hookName } = creatomateMetadata;
                const {
                    vertical: originalVertical,
                    fbAccountId: originalFbAccountId,
                    fbCampaignId: originalFbCampaignId,
                    fbScalingCampaignId: originalFbScalingCampaignId,
                    ideaWriter: originalIdeaWriter,
                    scriptWriter: originalScriptWriter,
                    counter: originalCounter,
                } = originalAdPerformance;

                const hookAdName = `${getAdName(
                    originalCounter,
                    originalVertical,
                    originalScriptWriter,
                    originalIdeaWriter,
                    'AZ'
                )}-HOOK:${hookName}`;

                const hookAd = await this.handleCreateAd(
                    metaAdCreatorService,
                    originalFbAccountId,
                    originalFbCampaignId,
                    hookAdName,
                    creatomateUrl
                );
                const hookAdId = hookAd.id;
                const hookAdSetId =
                    await metaAdCreatorService.getAdSetIdFromAdId(hookAdId);

                const hookAdPerformance: AdPerformance = {
                    ...originalAdPerformance,
                    adName: hookAdName,
                    gDriveDownloadUrl: creatomateUrl,
                    fbAdId: hookAdId,
                    fbAdSetId: hookAdSetId,
                    hookWriter: 'AZ',
                    performanceMetrics: {},
                    fbIsActive: true,
                    isHook: true,
                    hasHooksCreated: false,
                    isScaled: false,
                    hasScaled: false,
                };

                await saveAdPerformanceFirestore(hookAdId, hookAdPerformance);
                return hookAdPerformance;
            }
        );
        const hookAdPerformances = await Promise.all(createHookPromises);
        originalAdPerformance.hasHooksCreated = true;
        await saveAdPerformanceFirestore(
            originalAdPerformance.fbAdId,
            originalAdPerformance
        );
        return hookAdPerformances;
    }

    async handleScaling(
        adPerformance: AdPerformance,
        metaService: MetaAdCreatorService,
        scaledDailyBudgetCents: number
    ): Promise<AdPerformance> {
        adPerformance.hasScaled = true;
        await saveAdPerformanceFirestore(adPerformance.fbAdId, adPerformance);
        const scaledAdSet = await this.duplicateAdSetAndAdToCampaignWithUpdates(
            adPerformance.fbAdId,
            adPerformance.fbScalingCampaignId,
            scaledDailyBudgetCents,
            metaService
        );

        const scaledAdSetAds = await scaledAdSet.getAds(['id']);
        const scaledAdId = scaledAdSetAds[0].id;

        const scaledAdPerformance = {
            ...adPerformance,
            fbAdId: scaledAdId,
            fbAdSetId: scaledAdSet.id,
            performanceMetrics: {},
            hasHooksCreated: false,
            isScaled: true,
            hasScaled: false,
        };
        await saveAdPerformanceFirestore(scaledAdId, scaledAdPerformance);
        return scaledAdPerformance;
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

            const targeting: FbApiAdSetTargeting = {
                ...AD_ACCOUNT_DATA[fbAccountId as keyof typeof AD_ACCOUNT_DATA]
                    .targeting,
                geo_locations,
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

        return fbAdSettings;
    }

    public async getAdSetTargetingGeoLocationsMostRecentZipcodes(): Promise<{
        geo_locations: FbApiGeoLocations;
    }> {
        const folderName = 'roofing-zips-filtered';
        const todayDateStr = ZipcodeService.getTodayZipcodeFileDate();
        const fileName = `affiliate_demand_${todayDateStr}.json`;

        const { fileBuffer, contentType } = await downloadFileFromStorage(
            folderName,
            fileName
        );

        if (contentType !== 'application/json') {
            throw new Error(`Invalid content type: ${contentType}`);
        }

        const zipCodesObj: ZipcodeObj = JSON.parse(fileBuffer.toString());
        const { records } = zipCodesObj;

        const zipcodes = records.map((record) => record.zipCode);
        const validUniqueZipcodes =
            await ZipcodeService.filterUniqueValidZipcodes(zipcodes);

        const validUniqueFbTargetingZipcodes = validUniqueZipcodes.map(
            (zipCode) => ({ key: `US:${zipCode}` })
        );

        return {
            geo_locations: {
                zips: validUniqueFbTargetingZipcodes,
            },
        };
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
            scrapedAdArchiveId: videoUuid,
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
                apiVersion: '20.0',
            });
        }
        return this.metAdCreatorServices[accountId];
    }
}

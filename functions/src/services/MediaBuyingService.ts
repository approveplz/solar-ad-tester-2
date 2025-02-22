import { FbAdSettings } from '../models/FbAdSettings.js';
import { getFbAdSettings } from '../index.js';
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
} from '../firestoreCloud.js';
import invariant from 'tiny-invariant';
import { SkypeService } from './SkypeService.js';
import { TrelloService } from './TrelloService.js';
import { getAdName, getNextWeekdayUnixSeconds } from '../helpers.js';

export class MediaBuyingService {
    private metAdCreatorServices: Record<string, MetaAdCreatorService> = {};
    private LIFETIME_SPEND_THRESHOLD = 40;
    private LIFETIME_ROI_SCALING_THRESHOLD = 1.5;
    private LIFETIME_ROI_HOOK_THRESHOLD = 1.3;

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
        if (adPerformance.hasScaled) {
            console.log(
                `Ad ${adPerformance.fbAdId} has already been scaled, skipping processing`
            );
            return;
        }

        const fbRoiLifetime =
            adPerformance.performanceMetrics.fb?.lifetime?.roi ?? 0;
        const fbRoiLast3Days =
            adPerformance.performanceMetrics.fb?.last3Days?.roi ?? 0;

        if (fbRoiLifetime < 1 || fbRoiLast3Days < 1) {
            await this.pauseUnderperformingAd(
                adPerformance,
                metaAdCreatorService
            );

            const message = `
I've paused your ad because the ROI was under 1.00X
            
This is the ad that I've paused:
${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}`;
            await skypeService.sendMessage('ALAN', message);
        } else if (fbRoiLifetime < this.LIFETIME_ROI_HOOK_THRESHOLD) {
            console.log(
                `Ad ${
                    adPerformance.fbAdId
                } in profitable range (ROI: ${fbRoiLifetime.toFixed(
                    2
                )}). But do not create hooks or scale`
            );
        } else {
            if (
                !adPerformance.hasHooksCreated &&
                !adPerformance.isHook &&
                !adPerformance.hasScaled
            ) {
                const trelloCard = await this.handleCreateTrelloCard(
                    adPerformance,
                    trelloService
                );
                const message = `
I've created a new Trello card on the Adstonaut board for your ad because the ROI was over ${
                    this.LIFETIME_ROI_HOOK_THRESHOLD
                }x

This is the ad that I've created the card for for:
${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}`;
                await skypeService.sendMessage('ALAN', message);
            }
            if (
                !adPerformance.hasHooksCreated &&
                !adPerformance.isHook &&
                !adPerformance.hasScaled
            ) {
                const hookAdPerformances = await this.handleCreateHooks(
                    adPerformance,
                    metaAdCreatorService
                );
                const message = `
I've created hooks for your ad because the ROI was over ${
                    this.LIFETIME_ROI_HOOK_THRESHOLD
                }X

This is the ad that I've created hooks for:
${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}

These are the hooks that I've created:
${hookAdPerformances
    .map((hook) => skypeService.createMessageWithAdPerformanceInfo(hook, false))
    .join('')} `;
                await skypeService.sendMessage('ALAN', message);
            }

            if (
                fbRoiLifetime >= this.LIFETIME_ROI_SCALING_THRESHOLD &&
                !adPerformance.isScaled &&
                !adPerformance.hasScaled
            ) {
                const scaledAdDailyBudgetCents = 20000;
                const scaledAdPerformance = await this.handleScaling(
                    adPerformance,
                    metaAdCreatorService,
                    scaledAdDailyBudgetCents
                );

                const message = `
I've scaled your ad for you because the ROI was over ${
                    this.LIFETIME_ROI_SCALING_THRESHOLD
                }x

This is the original ad that I've scaled:
${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}

This is the scaled ad that I've created for you with a daily budget of $${(
                    scaledAdDailyBudgetCents / 100
                ).toFixed(2)}:
It will start running the next weekday.
${skypeService.createMessageWithAdPerformanceInfo(scaledAdPerformance, false)}`;
                await skypeService.sendMessage('ALAN', message);
            }
        }
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
        const cardName = trelloService.getRoofingCardName(
            originalAdPerformance.adName,
            5
        );
        const trelloCard = await trelloService.createCardFromRoofingTemplate(
            cardName,
            originalAdPerformance.gDriveDownloadUrl
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
                const originalFbAdSettings: FbAdSettings =
                    await getFbAdSettings(originalFbAccountId);
                const hookAd = await this.handleCreateAd(
                    metaAdCreatorService,
                    originalFbAdSettings,
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

    handleCreateAd = async (
        metaAdCreatorService: MetaAdCreatorService,
        fbAdSettings: FbAdSettings,
        campaignId: string,
        videoUuid: string,
        videoFileUrl: string,
        thumbnailFilePath: string = ''
    ): Promise<Ad> => {
        const adSetNameAndAdName = `${videoUuid}`;

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

        // Use facebook generated thumbnail
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
    };

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

        return {
            fb: {
                last3Days: {
                    spend: fbMetrics3d?.total_cost ?? 0,
                    revenue: fbMetrics3d?.total_revenue ?? 0,
                    roi: fbMetrics3d?.ROI ?? 0,
                    leads: fbMetrics3d?.leads ?? 0,
                    clicks: fbMetrics3d?.total_clicks ?? 0,
                },
                last7Days: {
                    spend: fbMetrics7d?.total_cost ?? 0,
                    revenue: fbMetrics7d?.total_revenue ?? 0,
                    roi: fbMetrics7d?.ROI ?? 0,
                    leads: fbMetrics7d?.leads ?? 0,
                    clicks: fbMetrics7d?.total_clicks ?? 0,
                },
                lifetime: {
                    spend: fbMetricsLifetime?.total_cost ?? 0,
                    revenue: fbMetricsLifetime?.total_revenue ?? 0,
                    roi: fbMetricsLifetime?.ROI ?? 0,
                    leads: fbMetricsLifetime?.leads ?? 0,
                    clicks: fbMetricsLifetime?.total_clicks ?? 0,
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

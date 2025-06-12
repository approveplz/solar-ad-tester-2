import { FbAdSettings } from '../models/FbAdSettings.js';
import {
    Ad,
    AdCreative,
    AdSet,
    AdVideo,
    AdImage,
} from 'facebook-nodejs-business-sdk';
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
    deleteAdPerformanceFirestore,
    getEventFirestoreDocRef,
    setEventFirestore,
    getFbAdSettingFirestore,
} from '../firestoreCloud.js';
import { invariant, getAccountIdFromVertical } from '../helpers.js';
import { TelegramService } from './TelegramService.js';
import { TrelloService } from './TrelloService.js';
import {
    getAdName,
    getNextWeekdayUnixSeconds,
    MediaBuyerCodes,
} from '../helpers.js';
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

    // async handleAdPerformanceUpdates() {
    //     const [
    //         bqPerformanceLast3Days,
    //         bqPerformanceLast7Days,
    //         bqPerformanceLifetime,
    //         firestoreAdPerformances,
    //     ] = await Promise.all([
    //         this.bigQueryService.getAdPerformance('AD_PERFORMANCE_3D'),
    //         this.bigQueryService.getAdPerformance('AD_PERFORMANCE_7D'),
    //         this.bigQueryService.getAdPerformance('AD_PERFORMANCE_LIFETIME'),
    //         getAdPerformanceFirestoreAll(),
    //     ]);

    //     for (const adPerformance of firestoreAdPerformances) {
    //         console.log('Processing ad performance:', adPerformance.fbAdId);
    //         await this.processSingleAdPerformance(
    //             adPerformance,
    //             bqPerformanceLast3Days,
    //             bqPerformanceLast7Days,
    //             bqPerformanceLifetime
    //         );
    //     }
    // }

    // private async processSingleAdPerformance(
    //     adPerformance: AdPerformance,
    //     bqMetrics3d: AdPerformanceDataBigQuery[],
    //     bqMetrics7d: AdPerformanceDataBigQuery[],
    //     bqMetricsLifetime: AdPerformanceDataBigQuery[]
    // ) {
    //     const fbAdId = adPerformance.fbAdId;

    //     if (!fbAdId) {
    //         console.log(
    //             `Ad ${adPerformance.adName} has no fbAdId, skipping processing. It was uploaded manually.`
    //         );
    //         return;
    //     }

    //     console.log(
    //         `Processing ad - ID: ${fbAdId}, Name: ${
    //             adPerformance.adName
    //         }, Active Status: ${
    //             adPerformance.fbIsActive ? 'Active' : 'Inactive'
    //         }`
    //     );

    //     if (!adPerformance.fbIsActive) {
    //         console.log(
    //             `Ad ${adPerformance.fbAdId} is not active, skipping processing`
    //         );
    //         return;
    //     }
    //     console.log(`Processing active ad ${adPerformance.fbAdId}`);

    //     adPerformance.performanceMetrics = this.buildPerformanceMetrics(
    //         fbAdId,
    //         bqMetrics3d,
    //         bqMetrics7d,
    //         bqMetricsLifetime
    //     );

    //     await saveAdPerformanceFirestore(fbAdId, adPerformance);

    //     const fbLifetimeSpend =
    //         adPerformance.performanceMetrics.fb?.lifetime?.spend ?? 0;
    //     if (fbLifetimeSpend < this.LIFETIME_SPEND_THRESHOLD) {
    //         console.log(
    //             `Ad ${fbAdId} below spend threshold. Spend: ${fbLifetimeSpend}`
    //         );
    //         return;
    //     }

    //     const fbAccountId = adPerformance.fbAccountId;
    //     invariant(fbAccountId, 'fbAccountId must be defined');

    //     const metaService = await this.getMetaAdCreatorService(fbAccountId);
    //     await this.handlePerformanceBasedActions(
    //         adPerformance,
    //         metaService,
    //         this.telegramService,
    //         this.trelloService
    //     );
    // }

    // async handlePerformanceBasedActions(
    //     adPerformance: AdPerformance,
    //     metaAdCreatorService: MetaAdCreatorService,
    //     telegramService: TelegramService,
    //     trelloService: TrelloService
    // ) {
    //     const fbRoiLifetime =
    //         adPerformance.performanceMetrics.fb?.lifetime?.revenue /
    //         adPerformance.performanceMetrics.fb?.lifetime?.spend;
    //     const fbRoiLast3Days =
    //         adPerformance.performanceMetrics.fb?.last3Days?.revenue /
    //         adPerformance.performanceMetrics.fb?.last3Days?.spend;

    //     const leadsLifetime =
    //         adPerformance.performanceMetrics.fb?.lifetime?.leads ?? 0;

    //     //         // Underperforming ad
    //     //         if (fbRoiLifetime < 1 || fbRoiLast3Days < 1) {
    //     //             const message = `
    //     // Consider pausing this ad because the ROI was under 1.00X

    //     // ${this.createMessageWithAdPerformanceInfo(adPerformance)}`;

    //     //             await telegramService.sendMessage(
    //     //                 telegramService.mediaBuyerChatIds[mediaBuyer],
    //     //                 message
    //     //             );
    //     //             // TODO: Remove this after testing
    //     //             await telegramService.sendMessage(
    //     //                 telegramService.mediaBuyerChatIds['AZ'],
    //     //                 message
    //     //             );
    //     //             return;
    //     //         }

    //     // Let ad run because its profitable, but dont create hooks, tello card, or scale.
    //     if (
    //         fbRoiLifetime < this.LIFETIME_ROI_SCALING_THRESHOLD &&
    //         leadsLifetime > 1
    //     ) {
    //         console.log(
    //             `Ad ${
    //                 adPerformance.fbAdId
    //             } in profitable range (ROI: ${fbRoiLifetime.toFixed(2)}).`
    //         );
    //         return;
    //     }
    // }

    //     private createMessageWithAdPerformanceInfo(
    //         adPerformance: AdPerformance
    //     ): string {
    //         const lifetimeMetrics = adPerformance.performanceMetrics.fb?.lifetime;
    //         const last3DaysMetrics = adPerformance.performanceMetrics.fb?.last3Days;
    //         return `
    // Ad Name: ${adPerformance.adName}
    // Ad ID: ${adPerformance.fbAdId}
    // Ad Set ID: ${adPerformance.fbAdSetId}
    // Campaign ID: ${adPerformance.fbCampaignId}

    // Last 3 Days:
    // Spend: $${(last3DaysMetrics?.spend ?? 0).toFixed(2)}
    // Revenue: $${(last3DaysMetrics?.revenue ?? 0).toFixed(2)}

    // Lifetime:
    // Spend: $${(lifetimeMetrics?.spend ?? 0).toFixed(2)}
    // Revenue: $${(lifetimeMetrics?.revenue ?? 0).toFixed(2)}
    // `;
    //     }

    // private async pauseUnderperformingAd(
    //     adPerformance: AdPerformance,
    //     metaAdCreatorService: MetaAdCreatorService
    // ) {
    //     await metaAdCreatorService.updateAdSetStatus(
    //         adPerformance.fbAdSetId,
    //         'PAUSED'
    //     );
    //     adPerformance.fbIsActive = false;
    //     await saveAdPerformanceFirestore(adPerformance.fbAdId, adPerformance);
    // }

    public async getFbAdSettings(
        fbAccountId: string,
        mediaBuyer: MediaBuyerCodes
    ) {
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
            // Page ID is dependent on the media buyer
            fbAdSettings.promotedObjectParams.pageId =
                AD_ACCOUNT_DATA[fbAccountId as keyof typeof AD_ACCOUNT_DATA]
                    .pageIds?.[mediaBuyer] ||
                AD_ACCOUNT_DATA[fbAccountId as keyof typeof AD_ACCOUNT_DATA]
                    .pageIds?.MA;
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

    public async handleCreateVideoAd(
        metaAdCreatorService: MetaAdCreatorService,
        campaignId: string,
        videoUuid: string,
        videoFileUrl: string,
        fbAdSettings: FbAdSettings,
        thumbnailFilePath: string = ''
    ): Promise<Ad> {
        const adSetNameAndAdName = `${videoUuid}`;

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

    public async handleCreateImageAd(
        metaAdCreatorService: MetaAdCreatorService,
        campaignId: string,
        imageUuid: string,
        imageFileUrl: string,
        fbAdSettings: FbAdSettings
    ): Promise<Ad> {
        const adSetNameAndAdName = `${imageUuid}`;

        const adSet: AdSet = await metaAdCreatorService.createAdSet({
            name: adSetNameAndAdName,
            campaignId,
            fbAdSettings,
        });

        // Create Ad Image
        const adImage: AdImage = await metaAdCreatorService.uploadAdImage(
            imageFileUrl
        );

        const adCreative: AdCreative =
            await metaAdCreatorService.createAdCreativeImage(
                `Creative-${adSetNameAndAdName}`,
                adImage,
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

        return {
            fb: {
                last3Days: {
                    spend: fbMetrics3d?.total_cost ?? 0,
                    revenue: fbMetrics3d?.total_revenue ?? 0,
                    leads: fbMetrics3d?.leads ?? 0,
                    clicks: fbMetrics3d?.total_clicks ?? 0,
                    partials: fbMetrics3d?.total_partials ?? 0,
                    engagements: fbMetrics3d?.engagements ?? 0,
                },
                last7Days: {
                    spend: fbMetrics7d?.total_cost ?? 0,
                    revenue: fbMetrics7d?.total_revenue ?? 0,
                    leads: fbMetrics7d?.leads ?? 0,
                    clicks: fbMetrics7d?.total_clicks ?? 0,
                    partials: fbMetrics7d?.total_partials ?? 0,
                    engagements: fbMetrics7d?.engagements ?? 0,
                },
                lifetime: {
                    spend: fbMetricsLifetime?.total_cost ?? 0,
                    revenue: fbMetricsLifetime?.total_revenue ?? 0,
                    leads: fbMetricsLifetime?.leads ?? 0,
                    clicks: fbMetricsLifetime?.total_clicks ?? 0,
                    partials: fbMetricsLifetime?.total_partials ?? 0,
                    engagements: fbMetricsLifetime?.engagements ?? 0,
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

    /**
     * Synchronizes ad status between Facebook and Firestore and updates performance metrics from BigQuery
     * Updates fbIsActive status for ads based on their current Facebook status
     * Updates performance metrics from BigQuery data
     * Searches across ALL configured ad accounts to find ads by name
     */
    async handleFbAdSync(): Promise<void> {
        try {
            console.log('Starting ad status and performance synchronization');

            // Get BigQuery performance data and Firestore ad performances in parallel
            const [
                bqPerformanceLast3Days,
                bqPerformanceLast7Days,
                bqPerformanceLifetime,
                allAdPerformances,
            ] = await Promise.all([
                this.bigQueryService.getAdPerformance('AD_PERFORMANCE_3D'),
                this.bigQueryService.getAdPerformance('AD_PERFORMANCE_7D'),
                this.bigQueryService.getAdPerformance(
                    'AD_PERFORMANCE_LIFETIME'
                ),
                getAdPerformanceFirestoreAll(),
            ]);

            // Get all configured account IDs
            const allAccountIds = Object.keys(AD_ACCOUNT_DATA);
            console.log(
                `Fetching ads from ${
                    allAccountIds.length
                } configured Facebook ad accounts: ${allAccountIds.join(', ')}`
            );

            // Fetch Facebook ads from all accounts
            const allFbAds = [];
            for (const accountId of allAccountIds) {
                try {
                    const metaService = await this.getMetaAdCreatorService(
                        accountId
                    );
                    const fbAds = await metaService.getAllAdsForCurrentAccount(
                        false
                    ); // false = get all ads, not just active
                    console.log(
                        `Retrieved ${fbAds.length} ads from Facebook account: ${accountId}`
                    );

                    // Add account ID to each ad for reference and add to results
                    const adsWithAccountId = fbAds.map((fbAd) => ({
                        ...fbAd,
                        accountId: accountId,
                    }));
                    allFbAds.push(...adsWithAccountId);
                } catch (error) {
                    console.error(
                        `Error fetching ads from account ${accountId}:`,
                        error
                    );
                    // Continue with other accounts even if one fails
                }
            }

            console.log(
                `Total Facebook ads retrieved across all accounts: ${allFbAds.length}`
            );

            // Create comprehensive map for Facebook ads by name across all accounts
            const fbAdsByName: { [adName: string]: any } = {};
            for (const fbAd of allFbAds) {
                fbAdsByName[fbAd.adName] = fbAd;
            }

            // Process each Firestore ad
            for (const ad of allAdPerformances) {
                try {
                    let needsUpdate = false;
                    let needsDocumentMigration = false;

                    // Search for Facebook ad by adName across all accounts
                    const fbAd = fbAdsByName[ad.adName];

                    if (fbAd) {
                        // Update or populate Facebook details
                        const currentFbStatus = fbAd.status === 'ACTIVE';

                        if (!ad.fbAdId) {
                            // Populate missing Facebook details
                            console.log(
                                `Found Facebook ad for ${ad.adName}, populating details: Account: ${fbAd.accountId}, FB Ad ID: ${fbAd.adId}, FB Ad Set ID: ${fbAd.adSetId}, FB Campaign ID: ${fbAd.campaignId}`
                            );

                            ad.fbAccountId = fbAd.accountId;
                            ad.fbAdId = fbAd.adId;
                            ad.fbAdSetId = fbAd.adSetId;
                            ad.fbCampaignId = fbAd.campaignId;
                            ad.fbIsActive = currentFbStatus;
                            needsUpdate = true;
                            needsDocumentMigration = true;
                        } else {
                            // Update status if changed (for ads that already have fbAdId)
                            if (ad.fbIsActive !== currentFbStatus) {
                                console.log(
                                    `Updating status for ad ${ad.adName} (${ad.fbAdId}): ${ad.fbIsActive} -> ${currentFbStatus}`
                                );
                                ad.fbIsActive = currentFbStatus;
                                needsUpdate = true;
                            }
                        }
                    } else if (ad.fbAdId) {
                        // Ad exists in Firestore but not found in Facebook - mark as inactive
                        if (ad.fbIsActive) {
                            console.log(
                                `Ad ${ad.adName} (${ad.fbAdId}) not found in Facebook, marking as inactive`
                            );
                            ad.fbIsActive = false;
                            needsUpdate = true;
                        }
                    }

                    // Update performance metrics from BigQuery (only if we have fbAdId)
                    if (ad.fbAdId) {
                        const updatedMetrics = this.buildPerformanceMetrics(
                            ad.fbAdId,
                            bqPerformanceLast3Days,
                            bqPerformanceLast7Days,
                            bqPerformanceLifetime
                        );

                        // Check if performance metrics have changed
                        const existingMetrics = JSON.stringify(
                            ad.performanceMetrics
                        );
                        const newMetrics = JSON.stringify(updatedMetrics);

                        if (existingMetrics !== newMetrics) {
                            console.log(
                                `Updating performance metrics for ad ${ad.adName} (${ad.fbAdId})`
                            );
                            ad.performanceMetrics = updatedMetrics;
                            needsUpdate = true;
                        }
                    }

                    // Save to Firestore if any updates were made
                    if (needsUpdate) {
                        if (needsDocumentMigration && ad.fbAdId) {
                            // Migrate document: delete old document with adName ID, create new with fbAdId
                            console.log(
                                `Migrating document from ${ad.adName} to ${ad.fbAdId}`
                            );
                            await saveAdPerformanceFirestore(ad.fbAdId, ad);
                            await deleteAdPerformanceFirestore(ad.adName);
                        } else {
                            // Regular update using existing document ID
                            const docId = ad.fbAdId || ad.adName;
                            await saveAdPerformanceFirestore(docId, ad);
                        }
                    }
                } catch (adError) {
                    console.error(`Error processing ad ${ad.adName}:`, adError);
                    // Continue with other ads even if one fails
                }
            }

            console.log('Completed ad status and performance synchronization');
        } catch (error) {
            console.error('Error in handleAdStatusSync:', error);
            throw error;
        }
    }
}

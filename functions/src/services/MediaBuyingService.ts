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
import {
    invariant,
    getAccountIdFromVertical,
    parseAdName,
    isVideoUrl,
} from '../helpers.js';
import { TelegramService } from './TelegramService.js';
import { TrelloService } from './TrelloService.js';
import {
    getAdName,
    getNextWeekdayUnixSeconds,
    MediaBuyerCodes,
    VerticalCodes,
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
    private LIFETIME_SPEND_THRESHOLD_FOR_HOOKS_USD = 50;
    private LIFETIME_ROI_HOOK_THRESHOLD = 1.3;
    private LIFETIME_TRELLO_CARD_CREATION_THRESHOLD = 1.3;

    constructor(
        private readonly creatomateService: CreatomateService,
        private readonly bigQueryService: BigQueryService,
        private readonly telegramService: TelegramService,
        private readonly trelloService: TrelloService
    ) {}

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
     * Creates hooks if needed
     */
    async handleFbAdSync(): Promise<void> {
        try {
            const [
                bqPerformanceLast3Days,
                bqPerformanceLast7Days,
                bqPerformanceLifetime,
                firestoreAdPerformances,
            ] = await Promise.all([
                this.bigQueryService.getAdPerformance('AD_PERFORMANCE_3D'),
                this.bigQueryService.getAdPerformance('AD_PERFORMANCE_7D'),
                this.bigQueryService.getAdPerformance(
                    'AD_PERFORMANCE_LIFETIME'
                ),
                getAdPerformanceFirestoreAll(),
            ]);

            const ozempicAccountIds = Object.keys(AD_ACCOUNT_DATA).filter(
                (accountId) =>
                    AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA]
                        .type === 'O'
            );

            // Pre-create all MetaAdCreatorService instances we'll need
            const metaServices: Record<string, MetaAdCreatorService> = {};
            for (const accountId of ozempicAccountIds) {
                metaServices[accountId] = await this.getMetaAdCreatorService(
                    accountId
                );
            }

            const allOzempicFbAds: {
                adId: string;
                adName: string;
                adSetId: string;
                campaignId: string;
                accountId: string;
                status: string;
            }[] = [];
            for (const accountId of ozempicAccountIds) {
                try {
                    const metaService = metaServices[accountId];
                    const fbAds = await metaService.getAllAdsForCurrentAccount(
                        false
                    ); // false = get all ads, not just active

                    // Add account ID to each ad for reference and add to results
                    const adsWithAccountId = fbAds.map((fbAd) => ({
                        ...fbAd,
                        accountId: accountId,
                    }));
                    allOzempicFbAds.push(...adsWithAccountId);
                } catch (error) {
                    console.error(
                        `Error fetching ads from account ${accountId}:`,
                        error
                    );
                    // Continue with other accounts even if one fails
                }
            }

            // Create comprehensive map for Firestore ads by adName for quick lookup
            const firestoreAdsById: { [adId: string]: AdPerformance } = {};
            for (const firestoreAd of firestoreAdPerformances) {
                firestoreAdsById[firestoreAd.fbAdId] = firestoreAd;
            }

            // Process all Facebook ads - either update existing or create new Firestore entries
            for (const fbAd of allOzempicFbAds) {
                try {
                    const currentFbIsActive = fbAd.status === 'ACTIVE';
                    const existingFirestoreAd = firestoreAdsById[fbAd.adId];

                    if (existingFirestoreAd) {
                        // Update existing Firestore entry
                        let needsUpdate = false;

                        // Update status if changed (for ads that already have fbAdId)
                        if (
                            existingFirestoreAd.fbIsActive !== currentFbIsActive
                        ) {
                            console.log(
                                `Updating is active status for ad ${existingFirestoreAd.adName} (${existingFirestoreAd.fbAdId}): ${existingFirestoreAd.fbIsActive} -> ${currentFbIsActive}`
                            );
                            existingFirestoreAd.fbIsActive = currentFbIsActive;
                            needsUpdate = true;
                        }

                        const updatedMetrics = this.buildPerformanceMetrics(
                            existingFirestoreAd.fbAdId,
                            bqPerformanceLast3Days,
                            bqPerformanceLast7Days,
                            bqPerformanceLifetime
                        );

                        // Check if performance metrics have changed
                        const existingMetrics = JSON.stringify(
                            existingFirestoreAd.performanceMetrics
                        );
                        const newMetrics = JSON.stringify(updatedMetrics);

                        if (existingMetrics !== newMetrics) {
                            existingFirestoreAd.performanceMetrics =
                                updatedMetrics;
                            needsUpdate = true;
                        }

                        // Check if we can create hooks. If we can, create them.
                        // await this.handleCreateHooksIfNeeded(
                        //     existingFirestoreAd
                        // );

                        // Save to Firestore if any updates were made
                        if (needsUpdate) {
                            // Regular update using fbAdId as document ID
                            await saveAdPerformanceFirestore(
                                existingFirestoreAd.fbAdId,
                                existingFirestoreAd
                            );
                        }
                    } else {
                        // Create new Firestore entry for Facebook ad that doesn't exist
                        console.log(
                            `Creating new Firestore entry for Facebook ad: ${fbAd.adName} (${fbAd.adId}) from account ${fbAd.accountId}`
                        );

                        // Build performance metrics for this ad
                        const performanceMetrics = this.buildPerformanceMetrics(
                            fbAd.adId,
                            bqPerformanceLast3Days,
                            bqPerformanceLast7Days,
                            bqPerformanceLifetime
                        );

                        // Get vertical from account config instead of parsing ad name
                        const vertical =
                            AD_ACCOUNT_DATA[
                                fbAd.accountId as keyof typeof AD_ACCOUNT_DATA
                            ]?.type || '';

                        let scriptWriter = '';
                        let ideaWriter = '';
                        let hookWriter = '';

                        try {
                            const parsed = parseAdName(fbAd.adName);
                            scriptWriter = parsed.scriptWriter;
                            ideaWriter = parsed.ideaWriter;
                            hookWriter = parsed.hookWriter;
                        } catch (error) {
                            console.log(
                                `Failed to parse ad name: ${fbAd.adName}`,
                                error
                            );
                        }

                        let gDriveDownloadUrl = '';
                        try {
                            const metaService = metaServices[fbAd.accountId];
                            const mediaUrl =
                                await metaService.getCreativeMediaUrl(
                                    fbAd.adId
                                );
                            if (mediaUrl) {
                                gDriveDownloadUrl = mediaUrl;
                            }
                        } catch (mediaError) {
                            console.error(
                                `Error getting media URL for new ad ${fbAd.adName}:`,
                                mediaError
                            );
                        }

                        // Create new AdPerformance object
                        const newAdPerformance: AdPerformance = {
                            adName: fbAd.adName,
                            fbAdId: fbAd.adId,
                            fbAdSetId: fbAd.adSetId,
                            fbCampaignId: fbAd.campaignId,
                            fbAccountId: fbAd.accountId,
                            fbIsActive: currentFbIsActive,
                            vertical: vertical as VerticalCodes,
                            gDriveDownloadUrl: gDriveDownloadUrl,
                            ideaWriter: ideaWriter as MediaBuyerCodes,
                            scriptWriter: scriptWriter as MediaBuyerCodes,
                            hookWriter: hookWriter as MediaBuyerCodes,
                            performanceMetrics,
                            hooksCreated: [],
                        };

                        // Save to Firestore using fbAdId as document ID
                        await saveAdPerformanceFirestore(
                            fbAd.adId,
                            newAdPerformance
                        );

                        console.log(
                            `Successfully created Firestore entry for new ad: ${fbAd.adName} (${fbAd.adId})`
                        );
                    }
                } catch (adError) {
                    console.error(
                        `Error processing Facebook ad ${fbAd.adName} (${fbAd.adId}):`,
                        adError
                    );
                    // Continue with other ads even if one fails
                }
            }

            // Handle Firestore ads that no longer exist in Facebook
            for (const firestoreAd of firestoreAdPerformances) {
                try {
                    // All Firestore ads should have fbAdId
                    if (!firestoreAd.fbAdId) {
                        console.error(
                            `ERROR: Firestore ad ${firestoreAd.adName} is missing fbAdId - this should not happen!`
                        );
                        continue;
                    }

                    // Check if this Firestore ad was found in our Facebook ads
                    const fbAdExists = allOzempicFbAds.some(
                        (fbAd) => fbAd.adId === firestoreAd.fbAdId
                    );

                    if (!fbAdExists && firestoreAd.fbIsActive) {
                        // Ad exists in Firestore but not found in Facebook - mark as inactive
                        console.log(
                            `Marking ad ${firestoreAd.adName} (${firestoreAd.fbAdId}) as inactive - not found in Facebook`
                        );
                        firestoreAd.fbIsActive = false;

                        await saveAdPerformanceFirestore(
                            firestoreAd.fbAdId,
                            firestoreAd
                        );
                    }
                } catch (adError) {
                    console.error(
                        `Error checking Firestore ad ${firestoreAd.adName}:`,
                        adError
                    );
                    // Continue with other ads even if one fails
                }
            }

            console.log('Completed ad status and performance synchronization');
        } catch (error) {
            console.error('Error in handleAdStatusSync:', error);
            throw error;
        }
    }

    /**
     * HOOK CREATION ASYNCHRONOUS FLOW
     *
     * This method initiates an asynchronous hook creation process that involves multiple services and handlers:
     *
     * FLOW OVERVIEW:
     * 1. This method checks if an ad meets the criteria for hook creation (spend threshold, ROI threshold, etc.)
     * 2. If criteria are met, it calls CreatomateService.uploadToCreatomateWithHooksAll() to start the process
     * 3. Creatomate processes the video rendering asynchronously (takes several minutes)
     * 4. When Creatomate finishes, it calls our webhook (handleCreatomateWebhookHttp in index.ts)
     * 5. The webhook handler calls CreatomateService.handleWebhookCompletion() which creates an event document
     *    in Firestore with pattern: 'events/creatomate_render:{renderId}'
     * 6. The Firestore document creation triggers handleCreatomateRenderCompletion() (index.ts)
     * 7. That handler uploads the completed video to Google Drive and updates this AdPerformance document's
     *    hooksCreated array with the new hook name
     *
     * KEY POINTS:
     * - This method returns immediately after starting the process - it doesn't wait for completion
     * - The actual AdPerformance.hooksCreated array is updated later by handleCreatomateRenderCompletion
     * - Multiple hooks are created in parallel (one for each hook template in Firebase Storage)
     * - Each completed hook triggers a separate event and gets added to hooksCreated individually
     */
    async handleCreateHooksIfNeeded(adPerformance: AdPerformance) {
        const {
            fbAdId,
            fbAdSetId,
            fbCampaignId,
            fbAccountId,
            hooksCreated = [],
            fbIsActive,
            hookWriter,
            scriptWriter,
            ideaWriter,
            vertical,
            adName,
            performanceMetrics,
        } = adPerformance;

        if (!adPerformance.gDriveDownloadUrl) {
            console.log(
                `Skipping hook creation for ad ${adName} because it has no media url saved in firestore`
            );
            return;
        }

        if (!isVideoUrl(adPerformance.gDriveDownloadUrl)) {
            console.log(
                `Skipping hook creation for ad ${adName} because it is not a video`
            );
            return;
        }

        if (
            !fbAccountId ||
            !fbIsActive ||
            hooksCreated.length > 0 ||
            !fbAdId ||
            !fbAdSetId ||
            hookWriter === MediaBuyerCodes.AZ
        ) {
            console.log(
                `Skipping hook creation for ad ${adName} because it is not active or already has hooks or hook writer is AZ`
            );
            return;
        }

        const lifetimeFbMetrics = performanceMetrics.fb?.lifetime;
        if (!lifetimeFbMetrics) {
            console.log(
                `Skipping hook creation for ad ${adName} because it has no lifetime metrics`
            );
            return;
        }

        const {
            spend: spendLifetime,
            revenue: revenueLifetime,
            leads: leadsLifetime,
            clicks: clicksLifetime,
            partials: partialsLifetime,
            engagements: engagementsLifetime,
        } = lifetimeFbMetrics;
        const isSpendSufficient =
            spendLifetime > this.LIFETIME_SPEND_THRESHOLD_FOR_HOOKS_USD;
        const aboveRoiThreshold =
            revenueLifetime / spendLifetime >
            this.LIFETIME_ROI_SCALING_THRESHOLD;

        console.log({
            spendLifetime,
            revenueLifetime,
            roi: revenueLifetime / spendLifetime,
            roiThreshold: this.LIFETIME_ROI_SCALING_THRESHOLD,
            spendThreshold: this.LIFETIME_SPEND_THRESHOLD_FOR_HOOKS_USD,
            isSpendSufficient,
            aboveRoiThreshold,
        });

        if (!isSpendSufficient || !aboveRoiThreshold) {
            console.log(
                `Skipping hook creation for ad ${adName} because it does not meet spend or ROI thresholds`
            );
            return;
        }

        // START ASYNC HOOK CREATION PROCESS
        // This call initiates the Creatomate rendering process but DOES NOT WAIT for completion.
        // The actual AdPerformance.hooksCreated array will be updated later when the async process completes.
        const result =
            await this.creatomateService.uploadToCreatomateWithHooksAll(
                adPerformance.gDriveDownloadUrl,
                adName,
                fbAdId
            );

        // Send Telegram notification about hook creation initiation
        // Note: This notification is sent immediately after starting the process, not after completion
        try {
            const azChatId =
                this.telegramService.mediaBuyerChatIds[MediaBuyerCodes.AZ];
            const message = `🎯 **Hook Created Successfully!**

📊 **Ad Details:**
• Ad Name: ${adName}
• FB Ad ID: ${fbAdId}
• Vertical: ${vertical || 'N/A'}

💰 **Performance Metrics:**
• Lifetime Spend: $${spendLifetime.toFixed(2)}
• Lifetime Revenue: $${revenueLifetime.toFixed(2)}
• ROI: ${((revenueLifetime / spendLifetime) * 100).toFixed(1)}%
• Leads: ${leadsLifetime}
• Clicks: ${clicksLifetime}
• Engagements: ${engagementsLifetime}

✅ Hook creation process has been initiated for this high-performing ad!`;

            await this.telegramService.sendMessage(azChatId, message);
            console.log(
                `Successfully sent hook creation notification to AZ for ad ${adName}`
            );
        } catch (telegramError) {
            console.error(
                `Failed to send Telegram notification to AZ for ad ${adName}:`,
                telegramError
            );
            // Don't fail the entire process if Telegram notification fails
        }
    }
}

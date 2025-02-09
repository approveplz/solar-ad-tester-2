import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'express';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { initializeApp, cert } from 'firebase-admin/app';
import invariant from 'tiny-invariant';
import serviceAccount from './solar-ad-tester-2-firebase-adminsdk-3iokc-bd8ce8732d.json' assert { type: 'json' };
import { config } from 'dotenv';
import MetaAdCreatorService from './services/MetaAdCreatorService.js';
import { FbAdSettings } from './models/FbAdSettings.js';
import { FbApiAdSetTargeting } from './models/MetaApiSchema.js';
import {
    Ad,
    AdCreative,
    AdImage,
    AdSet,
    AdVideo,
    //@ts-ignore
    Campaign,
} from 'facebook-nodejs-business-sdk';
import {
    getFbAdSettingFirestore,
    getIncrementedCounterFirestore,
    saveAdPerformanceFirestore,
    getAdPerformanceFirestoreAll,
    getAdPerformanceFirestoreById,
} from './firestoreCloud.js';
import {
    getSignedUploadUrl,
    getSignedDownloadUrl,
} from './firebaseStorageCloud.js';
import { AdPerformance, PerformanceMetrics } from './models/AdPerformance.js';
import {
    AdPerformanceDataBigQuery,
    BigQueryService,
} from './services/BigQueryService.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
    CreatomateMetadata,
    CreatomateService,
} from './services/CreatomateService.js';
type AdSetStatus = (typeof AdSet.Status)[keyof typeof AdSet.Status];
config();

const UUID_FIELD_NAME = 'uuid';
const AD_TYPE_FIELD_NAME = 'ad_type';
const ACCOUNT_ID_FIELD_NAME = 'account_id';
const IMAGE_BYTES_FIELD_NAME = 'image_bytes';

initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: 'solar-ad-tester-2.appspot.com',
});

/*
Targeting saved here does not include age or gender
*/
const AD_ACCOUNT_DATA = {
    '467161346185440': {
        name: 'Vincent x Digitsolution CC 1',
        type: 'R',
        campaignId: '120215523703190415',
        scalingCampaignId: '120216751824410415',
        targeting: {
            geo_locations: {
                location_types: ['home', 'recent'],
                location_cluster_ids: [{ key: '9096931440399416' }],
            },
            excluded_custom_audiences: [
                {
                    id: '120214060134290415',
                    name: 'Roofing Leads 180d',
                },
            ],
            brand_safety_content_filter_levels: ['FEED_RELAXED'],
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
    '8653880687969127': {
        name: 'Vincent x Digitsolution CC 2',
        type: 'R',
        campaignId: '120216226115490096',
        scalingCampaignId: '',
        targeting: {
            geo_locations: {
                location_types: ['home', 'recent'],
                // TODO: Change this to the correct location cluster ID
                location_cluster_ids: [{ key: '28950427651210969' }],
            },
            brand_safety_content_filter_levels: ['FEED_RELAXED'],
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
    '916987259877684': {
        name: 'SF- 121 (EST) - Ronin WH 262 - TN_RN_FB_ABG-999019',
        type: 'O',
        campaignId: '120215328779990104',
        scalingCampaignId: '',
        targeting: {
            excluded_geo_locations: {
                regions: [
                    {
                        key: '3847',
                        name: 'California',
                        country: 'US',
                    },
                    {
                        key: '3861',
                        name: 'Louisiana',
                        country: 'US',
                    },
                    {
                        key: '3867',
                        name: 'Mississippi',
                        country: 'US',
                    },
                ],
                location_types: ['home', 'recent'],
            },
            geo_locations: {
                location_types: ['home', 'recent'],
            },
            targeting_relaxation_types: {
                lookalike: 0,
                custom_audience: 0,
            },
        },
    },
};

const handleCreateAd = async (
    metaAdCreatorService: MetaAdCreatorService,
    fbAdSettings: FbAdSettings,
    campaignId: string,
    videoUuid: string,
    videoFileUrl: string,
    thumbnailFilePath: string = ''
) => {
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

    const adCreative: AdCreative = await metaAdCreatorService.createAdCreative(
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

    return ad;
};

interface GetSignedUploadUrlRequestQuery {
    [AD_TYPE_FIELD_NAME]?: string;
    [UUID_FIELD_NAME]?: string;
    [ACCOUNT_ID_FIELD_NAME]?: string;
}

export interface GetSignedUploadUrlResponsePayload {
    uploadUrl: string;
    fileName: string;
}

/**
 * Generates a signed URL for uploading third-party ad videos to Firebase Storage.
 *
 * @remarks
 * This HTTP function expects query parameters to specify the ad type and a unique identifier.
 * The generated URL will be valid for a limited time and allows direct upload to Firebase Storage.
 *
 * @example
 * GET /uploadThirdPartyAdGetSignedUploadUrl?ad_type=O&uuid=123456789
 *
 * @param req.query.ad_type - The type of ad ('O' for Ozempic, 'R' for Roofing)
 * @param req.query.uuid - Unique identifier for the video
 *
 * @returns {Promise<GetSignedUploadUrlResponsePayload>} JSON response containing:
 *  - uploadUrl: Signed URL for uploading the video
 *  - fileName: Generated filename for the video (format: AZ-{adType}-{uuid}.mp4)
 *
 * @throws {400} If required query parameters are missing
 * @throws {500} If there's an error generating the signed URL
 */
export const uploadThirdPartyAdGetSignedUploadUrl = onRequest(
    { cors: false },
    async (req: Request, res: Response) => {
        const query: GetSignedUploadUrlRequestQuery = req.query;
        const {
            [AD_TYPE_FIELD_NAME]: adType,
            [UUID_FIELD_NAME]: videoUuid,
            [ACCOUNT_ID_FIELD_NAME]: accountId,
        } = query;

        if (!videoUuid || !adType || !accountId) {
            res.status(400).json({
                error: `Missing required parameters. Please provide fields: ${AD_TYPE_FIELD_NAME}, ${UUID_FIELD_NAME}, ${ACCOUNT_ID_FIELD_NAME}`,
            });
            return;
        }

        try {
            const fileName = `AZ-${adType}-${videoUuid}.mp4`;
            const uploadUrl = await getSignedUploadUrl(
                accountId,
                fileName,
                videoUuid
            );
            console.log(
                `Created signed upload URL. fileName: ${fileName}. uploadUrl: ${uploadUrl}. adType: ${adType}. videoUuid: ${videoUuid}`
            );
            const payload: GetSignedUploadUrlResponsePayload = {
                uploadUrl,
                fileName,
            };
            res.status(200).json(payload);
        } catch (error) {
            const message = `Error generating signed upload URL. Error: ${error}`;
            console.error(message);
            res.status(500).json({ error: message });
        }
    }
);

const getAdName = (
    counter: number,
    vertical: string,
    scriptWriter: string,
    ideaWriter: string,
    hookWriter: string
): string => {
    return `${counter}-${vertical}-${scriptWriter}-${ideaWriter}-${hookWriter}`;
};

export const createFbAdHttp = onRequest(async (req, res) => {
    try {
        // Validate required request body parameters
        const requiredFields = [
            'accountId',
            'downloadUrl',
            'vertical',
            'scriptWriter',
            'ideaWriter',
            'hookWriter',
        ];
        const missingFields = requiredFields.filter(
            (field) => !req.body[field]
        );

        if (missingFields.length > 0) {
            res.status(400).json({
                success: false,
                error: `Missing required fields: ${missingFields.join(', ')}`,
            });
            return;
        }

        const {
            accountId,
            downloadUrl,
            vertical,
            scriptWriter,
            ideaWriter,
            hookWriter,
        } = req.body;

        const adAccountData =
            AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA];
        invariant(
            adAccountData,
            `ad account data not found in constants for account id: ${accountId}`
        );

        const { campaignId } = adAccountData;
        const fbAdSettings = await getFbAdSettings(accountId);
        const metaAdCreatorService = new MetaAdCreatorService({
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
            accountId: accountId || '',
            apiVersion: '20.0',
        });

        const nextCounter = await getIncrementedCounterFirestore();
        const adName = getAdName(
            nextCounter,
            vertical,
            scriptWriter,
            ideaWriter,
            hookWriter
        );

        const ad = await handleCreateAd(
            metaAdCreatorService,
            fbAdSettings,
            campaignId,
            adName,
            downloadUrl
        );

        const adResponse = (await (ad.get(['name', ' id']) as unknown)) as {
            id: string;
        };

        const fbAdId = adResponse.id;
        const fbAdSetId = await metaAdCreatorService.getAdSetIdFromAdId(fbAdId);

        const adPerformance: AdPerformance = {
            counter: nextCounter,
            fbAccountId: accountId,
            adName,
            gDriveDownloadUrl: downloadUrl,
            fbAdId,
            fbAdSetId,
            fbCampaignId: campaignId,
            vertical,
            ideaWriter,
            scriptWriter,
            hookWriter,
            performanceMetrics: {
                fbSpendLast3Days: 0,
                fbSpendLast7Days: 0,
                fbSpendLifetime: 0,
                fbRevenueLast3Days: 0,
                fbRevenueLast7Days: 0,
                fbRevenueLifetime: 0,
                fbRoiLast3Days: 0,
                fbRoiLast7Days: 0,
                fbRoiLifetime: 0,
            },
            fbIsActive: true,
            isHook: false,
            hasHooksCreated: false,
            isScaled: false,
            hasScaled: false,
        };

        await saveAdPerformanceFirestore(fbAdId, adPerformance);

        res.status(200).json({
            success: true,
            adPerformance,
        });
    } catch (error) {
        console.error('Error creating Facebook ad:', error);

        res.status(500).json({
            success: false,
            error: 'An unexpected error occurred while creating the Facebook ad',
        });
    }
});

export const watchCloudStorageUploads = onObjectFinalized(async (event) => {
    console.log('watched cloud storage uploads triggered');
    const WATCHED_FOLDERS = Object.keys(AD_ACCOUNT_DATA);

    const { name: filePath, contentType } = event.data;

    const [folder, fileName, ...rest] = filePath.split('/');

    console.log({ folder, eventData: event.data });

    if (!WATCHED_FOLDERS.includes(folder)) {
        return;
    }

    console.log('watch cloud storage uploads running');

    if (contentType !== 'video/mp4') {
        console.error(
            `Non-video file uploaded. filePath: ${filePath}. contentType: ${contentType}`
        );
        return;
    }

    console.log(
        `Triggering function for upload in watched folder: ${folder}. filePath: ${filePath}`
    );

    const { url: downloadUrl, uuid } = await getSignedDownloadUrl(filePath);

    invariant(uuid && typeof uuid === 'string', 'uuid must exist');

    const accountId = folder;

    const fbAdSettings = await getFbAdSettings(accountId);

    invariant(fbAdSettings !== null, `fbAdSettings is null`);

    const adAccountData =
        AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA];
    invariant(
        adAccountData,
        `ad account data not found in constants for account id: ${accountId}`
    );

    const { campaignId } = adAccountData;

    invariant(
        campaignId,
        `Campaign ID not found in AD_ACCOUNT_DATA for account ID: ${accountId}`
    );

    const metaAdCreatorService = new MetaAdCreatorService({
        appId: process.env.FACEBOOK_APP_ID || '',
        appSecret: process.env.FACEBOOK_APP_SECRET || '',
        accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
        accountId: accountId || '',
        apiVersion: '20.0',
    });

    // /* Create Campaign */
    // // const campaignName = `[facebook] - [GLP-1] - [AZ] - [USA] - [All] - [GLP-V1] - [Auto Creative Testing] - [1]`;
    // const campaignName = `[facebook] - [ROOFING] - [AZ] - [USA] - [All] - [Auto Creative Testing] - [1]`;

    // const campaign: Campaign = await metaAdCreatorService.createCampaign({
    //     name: campaignName,
    //     fbAdSettings,
    // });
    // campaignId = campaign.id; // Campaign ID if we create it here

    const ad = await handleCreateAd(
        metaAdCreatorService,
        fbAdSettings,
        campaignId,
        uuid,
        downloadUrl
    );

    // Send adId and adName to Make.com webhook
    const adResponse = (await (ad.get(['name', ' id']) as unknown)) as {
        name: string;
        id: string;
    };

    const adName = adResponse.name;
    const adId = adResponse.id;
    console.log({ ad, adName, adId });
    const makeWebhookUrl =
        'https://hook.us1.make.com/w08iv7ieulywlnb91i594d93c1mqks7y';
    const makeWebhookPayload = {
        adId,
        adName,
        accountId,
    };

    await fetch(makeWebhookUrl, {
        method: 'POST',
        body: JSON.stringify(makeWebhookPayload),
    });
});

const getFbAdSettings = async (accountId: string) => {
    // Account ID determines if ad type is O or R
    const fbAdSettings = await getFbAdSettingFirestore(accountId);
    if (fbAdSettings) {
        invariant(
            fbAdSettings.adSetParams.adSetTargeting,
            'adSetTargeting must exist'
        );
        const { age_max, age_min, genders } =
            fbAdSettings.adSetParams.adSetTargeting;

        // Get targeting
        const targeting: FbApiAdSetTargeting = {
            ...AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA]
                .targeting,
            age_max,
            age_min,
            genders,
        };

        fbAdSettings.adSetParams.adSetTargeting = targeting;
    } else {
        throw new Error(`No ad settings found for accountId: ${accountId}`);
    }

    return fbAdSettings;
};

export const handleAdTesting = onRequest(async (req, res) => {
    const lifetimeSpendThresholdDollars = 40;
    const lifetimeRoiThreshold = 1.5;
    const { adId, accountId, totalSpendLifetimeDollars, totalRoiLifetime } =
        req.body;

    let fbAdSetStatus: AdSetStatus = 'ACTIVE'; // Default Facebook ad set status
    let message = '';

    try {
        // Validate required parameters
        const missingParams = [];
        if (!adId) missingParams.push('adId');
        if (!accountId) missingParams.push('accountId');
        if (totalSpendLifetimeDollars === undefined)
            missingParams.push('totalSpendLifetimeDollars');
        if (totalRoiLifetime === undefined)
            missingParams.push('totalRoiLifetime');

        if (missingParams.length > 0) {
            message = `Missing required parameters: ${missingParams.join(
                ', '
            )}`;
            res.status(400).json({
                success: false,
                status: fbAdSetStatus,
                message,
            });
            return;
        }

        if (totalSpendLifetimeDollars < lifetimeSpendThresholdDollars) {
            message = `Ad ${adId} still under the lifetime spend threshold of ${lifetimeSpendThresholdDollars} dollars. Total spend: ${totalSpendLifetimeDollars}`;
            res.status(200).json({
                success: true,
                status: fbAdSetStatus,
                message,
            });
            return;
        }

        console.log(`Spend threshold met for ad ${adId}`);

        const metaAdCreatorService = new MetaAdCreatorService({
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
            accountId,
            apiVersion: '20.0',
        });
        const adSetId = await metaAdCreatorService.getAdSetIdFromAdId(adId);

        console.log(`Lifetime ROI: ${totalRoiLifetime}`);

        if (totalRoiLifetime < 1) {
            fbAdSetStatus = 'PAUSED';
            message = `Ad ${adId} has ROI of < 1. ROI: ${totalRoiLifetime}. Ad Paused.`;

            await metaAdCreatorService.updateAdSetStatus(
                adSetId,
                fbAdSetStatus
            );
            console.log(`Updated ad ${adId} status to ${fbAdSetStatus}`);
        } else if (totalRoiLifetime < lifetimeRoiThreshold) {
            message = `Ad ${adId} has ROI between 1 and ${lifetimeRoiThreshold}. ROI: ${totalRoiLifetime}. Keep running because profitable but do not scale.`;
        } else {
            message = `Ad ${adId} has ROI >= ${lifetimeRoiThreshold}. ROI: ${totalRoiLifetime}. Ready for scaling.`;
            // TODO: Implement scaling logic
            // - try ads with hooks

            const accountData =
                AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA];
            const { scalingCampaignId } = accountData;

            await duplicateAdSetAndAdToCampaign(
                metaAdCreatorService,
                adId,
                scalingCampaignId,
                20000
            );
        }

        console.log(message);
        res.status(200).json({ success: true, status: fbAdSetStatus, message });
    } catch (error) {
        message = `Error processing ad ${adId}: ${
            error instanceof Error ? error.message : 'Unknown error'
        }`;
        console.error(message);
        res.status(500).json({
            success: false,
            status: fbAdSetStatus,
            message,
        });
    }
});

async function duplicateAdSetAndAdToCampaign(
    metaAdCreatorService: MetaAdCreatorService,
    adId: string,
    campaignId: string,
    dailyBudgetCents: number
) {
    const adSetId = await metaAdCreatorService.getAdSetIdFromAdId(adId);
    const duplicatedAdSet = await metaAdCreatorService.duplicateAdSet(
        adSetId,
        campaignId
    );

    console.log(
        `Successfully duplicated ad set ${adSetId} to campaign ${campaignId}`
    );

    const updateDailyBudgetParams = {
        daily_budget: dailyBudgetCents,
    };

    const duplicateAdSetWithUpdatedBudget = await duplicatedAdSet.update(
        [],
        updateDailyBudgetParams
    );

    console.log(
        `Successfully updated daily budget for ad set ${adSetId} to ${dailyBudgetCents}`
    );

    return duplicateAdSetWithUpdatedBudget;
}

// https://duplicateadsetandadtocampaignhttp-txyabkufvq-uc.a.run.app
export const duplicateAdSetAndAdToCampaignHttp = onRequest(async (req, res) => {
    try {
        // Validate required input parameters
        const { adId, accountId } = req.body;
        if (!adId || !accountId) {
            res.status(400).json({
                success: false,
                error: 'Missing required parameters: adId and accountId are required',
            });
            return;
        }
        const accountData =
            AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA];
        if (!accountData) {
            res.status(400).json({
                success: false,
                error: `Invalid accountId: ${accountId}`,
            });
            return;
        }
        const { scalingCampaignId } = accountData;
        if (!scalingCampaignId) {
            res.status(400).json({
                success: false,
                error: `No scaling campaign ID configured for account: ${accountId}`,
            });
            return;
        }

        const metaAdCreatorService = new MetaAdCreatorService({
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
            accountId,
            apiVersion: '20.0',
        });

        const duplicatedAdSet = await duplicateAdSetAndAdToCampaign(
            metaAdCreatorService,
            adId,
            scalingCampaignId,
            20000
        );

        res.status(200).json({
            success: true,
            error: null,
            data: { duplicatedAdSet },
        });
        return;
    } catch (error) {
        console.error('Error duplicating ad set:', error);
        res.status(500).json({
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'An unexpected error occurred',
        });
    }
    return;
});

const LIFETIME_SPEND_THRESHOLD = 40;
const LIFETIME_ROI_SCALING_THRESHOLD = 1.5;
const LIFETIME_ROI_HOOK_THRESHOLD = 1.3;

function buildPerformanceMetrics(
    bqMetrics3d?: AdPerformanceDataBigQuery,
    bqMetrics7d?: AdPerformanceDataBigQuery,
    bqMetricsLifetime?: AdPerformanceDataBigQuery
): PerformanceMetrics {
    return {
        fbSpendLast3Days: bqMetrics3d?.total_cost ?? 0,
        fbSpendLast7Days: bqMetrics7d?.total_cost ?? 0,
        fbSpendLifetime: bqMetricsLifetime?.total_cost ?? 0,
        fbRevenueLast3Days: bqMetrics3d?.total_revenue ?? 0,
        fbRevenueLast7Days: bqMetrics7d?.total_revenue ?? 0,
        fbRevenueLifetime: bqMetricsLifetime?.total_revenue ?? 0,
        fbRoiLast3Days: bqMetrics3d?.ROI ?? 0,
        fbRoiLast7Days: bqMetrics7d?.ROI ?? 0,
        fbRoiLifetime: bqMetricsLifetime?.ROI ?? 0,
    };
}

export const updateAdPerformanceScheduled = onSchedule(
    'every 1 hours',
    async (event) => {
        const metAdCreatorServices: Record<string, MetaAdCreatorService> = {};

        try {
            const bigQueryService = new BigQueryService();
            const [
                bqFbPerformanceLast3Days,
                bqFbPerformanceLast7Days,
                bqFbPerformanceLifetime,
                firestoreAdPerformances,
            ] = await Promise.all([
                bigQueryService.getAdPerformance('AD_PERFORMANCE_3D'),
                bigQueryService.getAdPerformance('AD_PERFORMANCE_7D'),
                bigQueryService.getAdPerformance('AD_PERFORMANCE_LIFETIME'),
                getAdPerformanceFirestoreAll(),
            ]);

            for (const adPerformance of firestoreAdPerformances) {
                const fbAdId = adPerformance.fbAdId;

                // Skip inactive ads
                if (!adPerformance.fbIsActive) {
                    continue;
                }

                // Find relevant metrics
                const bqFbMetrics3d = bqFbPerformanceLast3Days.find(
                    (ad) => ad.AdID === fbAdId && ad.Platform === 'FB'
                );
                const bqFbMetrics7d = bqFbPerformanceLast7Days.find(
                    (ad) => ad.AdID === fbAdId && ad.Platform === 'FB'
                );
                const bqFbMetricsLifetime = bqFbPerformanceLifetime.find(
                    (ad) => ad.AdID === fbAdId && ad.Platform === 'FB'
                );

                // Update performance metrics
                adPerformance.performanceMetrics = buildPerformanceMetrics(
                    bqFbMetrics3d,
                    bqFbMetrics7d,
                    bqFbMetricsLifetime
                );

                // Skip if below spend threshold
                if (
                    adPerformance.performanceMetrics.fbSpendLifetime <
                    LIFETIME_SPEND_THRESHOLD
                ) {
                    console.log(
                        `Ad ${fbAdId} has spent less than ${LIFETIME_SPEND_THRESHOLD} dollars. Skipping...`
                    );
                    continue;
                }

                const fbAccountId = adPerformance.fbAccountId;
                invariant(fbAccountId, 'fbAccountId must be defined');

                if (!metAdCreatorServices[fbAccountId]) {
                    metAdCreatorServices[fbAccountId] =
                        new MetaAdCreatorService({
                            appId: process.env.FACEBOOK_APP_ID || '',
                            appSecret: process.env.FACEBOOK_APP_SECRET || '',
                            accessToken:
                                process.env.FACEBOOK_ACCESS_TOKEN || '',
                            accountId: fbAccountId,
                        });
                }

                // Handle ad based on ROI
                const fbRoiLifetime =
                    adPerformance.performanceMetrics.fbRoiLifetime;
                const fbRoiLast3Days =
                    adPerformance.performanceMetrics.fbRoiLast3Days;
                let message: string;
                let fbAdSetStatus: AdSetStatus = 'ACTIVE';

                if (fbRoiLifetime < 1 || fbRoiLast3Days < 1) {
                    fbAdSetStatus = 'PAUSED';
                    adPerformance.fbIsActive = false;
                    message = `Ad ${fbAdId} has ROI < 1. Lifetime ROI: ${fbRoiLifetime}, Last 3 Days ROI: ${fbRoiLast3Days}. Ad Paused.`;
                } else if (fbRoiLifetime < LIFETIME_ROI_HOOK_THRESHOLD) {
                    message = `Ad ${fbAdId} has 1 < ROI < ${LIFETIME_ROI_HOOK_THRESHOLD}. ROI: ${fbRoiLifetime}. Keep Ad running because profitable but do not create hooks or scale.`;
                } else {
                    // fbRoiLifetime >= LIFETIME_ROI_HOOK_THRESHOLD
                    if (!adPerformance.hasHooksCreated) {
                        const creatomateService =
                            await CreatomateService.create(
                                process.env.CREATOMATE_API_KEY || ''
                            );
                        await creatomateService.uploadToCreatomateWithHooksAll(
                            adPerformance.gDriveDownloadUrl,
                            adPerformance.adName,
                            fbAdId
                        );
                        adPerformance.hasHooksCreated = true;
                        message = `Ad ${fbAdId} has ROI above ${LIFETIME_ROI_HOOK_THRESHOLD}. ROI: ${fbRoiLifetime}. Create hooks.`;
                    } else {
                        message = 'Hooks already created.';
                    }

                    if (fbRoiLifetime >= LIFETIME_ROI_SCALING_THRESHOLD) {
                        if (!adPerformance.hasScaled) {
                            // TODO: Implement scaling logic
                            adPerformance.hasScaled = true;
                            message = `Ad ${fbAdId} has ROI >= ${LIFETIME_ROI_SCALING_THRESHOLD}. ROI: ${fbRoiLifetime}. Ready for scaling.`;
                        } else {
                            message = 'Ad has already been scaled.';
                        }
                    }
                }

                // Update ad set status in Facebook
                await metAdCreatorServices[fbAccountId].updateAdSetStatus(
                    adPerformance.fbAdSetId,
                    fbAdSetStatus
                );

                // Save updated performance data
                await saveAdPerformanceFirestore(fbAdId, adPerformance);

                console.log(`Updated ad performance for ad ${fbAdId}`);
                console.log(message);
            }
        } catch (error) {
            console.error('Error updating ad performances:', error);
            throw error; // Rethrowing the error will mark the execution as failed in Firebase
        }
    }
);

export const handleCreatomateRequestHttp = onRequest(async (req, res) => {
    console.log('creatomate request received');

    const creatomateService = await CreatomateService.create(
        process.env.CREATOMATE_API_KEY || ''
    );

    const baseVideoUrl =
        'https://drive.google.com/uc?export=download&id=1OMj1MwqUL2V_r12VEWxWEmfip28WO8s7';
    const baseAdName = '103-R-AZ-AZ-AZ';
    const fbAdId = '120216814815950415';
    const result = await creatomateService.uploadToCreatomateWithHooksAll(
        baseVideoUrl,
        baseAdName,
        fbAdId
    );
    res.status(200).json({ success: true, result });
});

export const handleCreatomateWebhookHttp = onRequest(async (req, res) => {
    const {
        id: creatomateRenderId,
        status,
        url: creatomateUrl,
        metadata: metadataJSON,
    } = req.body;
    const metadata: CreatomateMetadata = JSON.parse(metadataJSON);

    if (status !== 'succeeded') {
        console.log(`Creatomate render ${creatomateRenderId} failed`);
        res.status(500).json({
            success: false,
            error: 'Creatomate render failed',
        });
        return;
    }

    const { hookName, fbAdId: originalFbAdId } = metadata;

    const originalAdPerformance = await getAdPerformanceFirestoreById(
        originalFbAdId
    );
    invariant(originalAdPerformance, 'adPerformance must be defined');

    const {
        vertical: originalVertical,
        fbAccountId: originalFbAccountId,
        fbCampaignId: originalFbCampaignId,
        ideaWriter: originalIdeaWriter,
        scriptWriter: originalScriptWriter,
        counter: originalCounter,
    } = originalAdPerformance;

    const originalFbAdSettings = await getFbAdSettings(originalFbAccountId);
    const metaAdCreatorService = new MetaAdCreatorService({
        appId: process.env.FACEBOOK_APP_ID || '',
        appSecret: process.env.FACEBOOK_APP_SECRET || '',
        accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
        accountId: originalFbAccountId || '',
        apiVersion: '20.0',
    });

    const hookAdName = `${getAdName(
        originalCounter,
        originalVertical,
        originalScriptWriter,
        originalIdeaWriter,
        'AZ'
    )}-HOOK:${hookName}`;

    const hookAd = await handleCreateAd(
        metaAdCreatorService,
        originalFbAdSettings,
        originalFbCampaignId,
        hookAdName,
        creatomateUrl
    );

    const hookAdResponse = (await (hookAd.get(['name', ' id']) as unknown)) as {
        id: string;
    };

    const hookAdId = hookAdResponse.id;
    const hookAdSetId = await metaAdCreatorService.getAdSetIdFromAdId(hookAdId);

    const hookAdPerformance: AdPerformance = {
        counter: originalCounter,
        fbAccountId: originalFbAccountId,
        adName: hookAdName,
        gDriveDownloadUrl: creatomateUrl,
        fbAdId: hookAdId,
        fbAdSetId: hookAdSetId,
        fbCampaignId: originalFbCampaignId,
        vertical: originalVertical,
        ideaWriter: originalIdeaWriter,
        scriptWriter: originalScriptWriter,
        hookWriter: 'AZ',
        performanceMetrics: {
            fbSpendLast3Days: 0,
            fbSpendLast7Days: 0,
            fbSpendLifetime: 0,
            fbRevenueLast3Days: 0,
            fbRevenueLast7Days: 0,
            fbRevenueLifetime: 0,
            fbRoiLast3Days: 0,
            fbRoiLast7Days: 0,
            fbRoiLifetime: 0,
        },
        fbIsActive: true,
        isHook: true,
        hasHooksCreated: false,
        isScaled: false,
        hasScaled: false,
    };

    await saveAdPerformanceFirestore(hookAdId, hookAdPerformance);

    res.status(200).json({ success: true });
});

/*
TODO: Fix this after refactor to read params by ad account ID instead of ad type
*/
export const createImageAdFromHttp = onRequest(async (req, res) => {
    try {
        console.log('createImageAdFromHttp handler received request');

        const accountId = process.env.FACEBOOK_ACCOUNT_ID_OZEMPIC;
        const metaAdCreatorService = new MetaAdCreatorService({
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
            accountId: accountId || '',
            apiVersion: '20.0',
        });

        const uuid = req.body[UUID_FIELD_NAME];
        const imageBytes = req.body[IMAGE_BYTES_FIELD_NAME];
        const adType = req.body[AD_TYPE_FIELD_NAME];

        const adSetNameAndAdName = `${uuid}-AZ`;

        const fbAdSettings = await getFbAdSettings(adType);

        const campaignId = process.env.CAMPAIGN_ID_FOR_467161346185440; // Read Campaign ID
        invariant(campaignId, 'empty ozempic campaign ID');

        const adSet: AdSet = await metaAdCreatorService.createAdSet({
            name: adSetNameAndAdName,
            campaignId,
            fbAdSettings,
        });

        const adImage: AdImage = await metaAdCreatorService.uploadAdImage(
            imageBytes
        );

        // const name = adImage._data.images.bytes.name;
        // const hash = adImage._data.images.bytes.hash;

        const adCreative = await metaAdCreatorService.createAdCreativeImage(
            adSetNameAndAdName,
            adImage,
            fbAdSettings,
            adType
        );

        // console.log({ adCreative });

        const ad: Ad = await metaAdCreatorService.createAd({
            name: adSetNameAndAdName,
            adSet,
            adCreative,
        });

        // console.log({ adImage });
        res.status(200).json({
            code: 'SUCESS',
            error: '',
            payload: {
                ad_id: ad.id,
            },
        });
    } catch (error) {
        console.error('Error in test handler:', error);

        res.status(500).json({
            code: 'ERROR',
            error: error,
        });
    }
});

// const getAdSetTargeting = (
//     accountId: string,
//     ageMax: number,
//     ageMin: number,
//     genders?: string[]
// ): FbApiAdSetTargeting => {
//     let targeting: FbApiAdSetTargeting;

//     if (accountId === 'O') {
//         const excluded_geo_locations = {
//             regions: [
//                 {
//                     key: '3847',
//                     name: 'California',
//                     country: 'US',
//                 },
//                 {
//                     key: '3861',
//                     name: 'Louisiana',
//                     country: 'US',
//                 },
//                 {
//                     key: '3867',
//                     name: 'Mississippi',
//                     country: 'US',
//                 },
//             ],
//             location_types: ['home', 'recent'],
//         };

//         const geo_locations = {
//             countries: ['US'],
//             location_types: ['home', 'recent'],
//         };

//         const targeting_relaxation_types = {
//             lookalike: 0,
//             custom_audience: 0,
//         };

//         targeting = {
//             age_max: ageMax,
//             age_min: ageMin,
//             excluded_geo_locations,
//             geo_locations,
//             targeting_relaxation_types,
//             genders,
//         };
//     } else if (accountId === 'R') {
//         const geo_locations = {
//             countries: ['US'],
//             location_types: ['home', 'recent'],
//             location_cluster_ids: [{ key: '9303790499649916' }],
//         };

//         const targeting_relaxation_types = {
//             lookalike: 0,
//             custom_audience: 0,
//         };

//         targeting = {
//             age_max: ageMax,
//             age_min: ageMin,
//             geo_locations,
//             targeting_relaxation_types,
//             genders,
//         };
//     } else {
//         throw new Error(`Invalid accountId: ${accountId}`);
//     }

//     return targeting;
// };

// /* No longer used. This was for solar */
// export const createAdFromClickRequest = onRequest(
//     {
//         cors: true,
//         timeoutSeconds: 60,
//         memory: '512MiB',
//     },
//     async (req, res) => {
//         const {
//             adArchiveId,
//             videoHdUrl,
//             videoSdUrl,
//             videoPreviewImageUrl,
//             adTitle,
//             adBody,
//             ctaType,
//             pageName,
//             pageId,
//             pageLikeCount,
//             hasUserReported,
//             startDateUnixSeconds,
//             endDateUnixSeconds,
//             publisherPlatform,
//         } = req.body;

//         const scrapedAd: ParsedFbAdInfo = {
//             adArchiveId,
//             videoHdUrl,
//             videoSdUrl,
//             videoPreviewImageUrl,
//             adTitle,
//             adBody,
//             ctaType,
//             pageName,
//             pageId,
//             pageLikeCount,
//             hasUserReported,
//             startDateUnixSeconds,
//             endDateUnixSeconds,
//             publisherPlatform,
//         };

//         const metaAdCreatorServiceSolar = new MetaAdCreatorService({
//             appId: process.env.FACEBOOK_APP_ID || '',
//             appSecret: process.env.FACEBOOK_APP_SECRET || '',
//             accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
//             accountId: process.env.FACEBOOK_ACCOUNT_ID || '',
//             apiVersion: '20.0',
//         });

//         try {
//             /* Generate hash of video */
//             const scrapedVideoFileUrl =
//                 scrapedAd.videoHdUrl || scrapedAd.videoSdUrl;

//             const videoHash = await generateVideoHash(scrapedVideoFileUrl, 1);
//             const uploadedVideoHashHap = await getVideoHashMapFirestore(
//                 'SOLAR'
//             );

//             /* Check if we have already tested this video */
//             if (videoHash in uploadedVideoHashHap) {
//                 const existingAdName = uploadedVideoHashHap[videoHash];
//                 console.log(
//                     `This video has already been uploaded. Video hash: ${videoHash}. Existing ad name: ${existingAdName}`
//                 );
//                 res.status(500).send({ code: 'DUPLICATE' });
//             }

//             const campaignParams = {
//                 objective: 'OUTCOME_LEADS',
//                 status: 'PAUSED',
//             };

//             const promotedObjectParams = {
//                 pixelId: '700671091822152',
//                 customEventType: 'LEAD',
//                 pageId: '117903068075583',
//             };

//             const adSetParams = {
//                 bidAmountCents: 2200,
//                 optimizationGoal: 'OFFSITE_CONVERSIONS',
//                 billingEvent: 'IMPRESSIONS',
//                 dailyBudgetCents: '2000',
//                 lifetimeBudgetCents: '2000',
//                 bidStrategy: 'COST_CAP',
//             };

//             const ctaLinkValue =
//                 'https://www.greenenergycollective.org/s/no-cost-solar-v3';
//             const videoMessage = `Homeowners, would you trade 30 seconds for $8,500?

// The recently revamped "2024 Solar Incentive Program" means you can now have solar panels installed at no cost on your roof, and make a major cut in your energy bills

// All you have to do is click the link below to find out if you qualify (takes 30 seconds or less)

// ${ctaLinkValue}`;

//             const adCreativeParams = {
//                 videoTitle:
//                     'Homeowners In Your Area Are Getting Paid to Go Solar',
//                 videoMessage,
//                 linkDescription: 'Less than 30 seconds to Qualify',
//                 ctaType: 'LEARN_MORE',
//                 ctaLinkValue,
//             };

//             const fbAdSettings: FbAdSettings = {
//                 campaignParams,
//                 promotedObjectParams,
//                 adSetParams,
//                 adCreativeParams,
//             };

//             // Create Campaign

//             // const campaignName = `[facebook] - [Solar] - [AZ] - [MOM] - [ALL] - [SOLAR-SHS-V3] - APP - 1`;
//             // const campaign: Campaign =
//             //     await metaAdCreatorService.createCampaign({
//             //         name: campaignName,
//             //         fbAdSettings,
//             //     });
//             // const campaignId = campaign.id; // Campaign ID if we create it here

//             const campaignId = '120210470839980108'; // Real Campaign ID
//             // const campaignId = '120210773404130108'; // Test Campaign ID

//             const adSetNameAndAdName = `AZ-S-${scrapedAd.adArchiveId}`;

//             const adSet: AdSet | undefined =
//                 await metaAdCreatorServiceSolar.createAdSet({
//                     name: adSetNameAndAdName,
//                     campaignId,
//                     fbAdSettings,
//                 });

//             invariant(adSet, 'adSet must be defined');

//             // Create Ad Video
//             const adVideo: AdVideo =
//                 await metaAdCreatorServiceSolar.uploadAdVideo({
//                     scrapedAdArchiveId: scrapedAd.adArchiveId,
//                     videoFileUrl: scrapedVideoFileUrl,
//                 });

//             const adCreative: AdCreative =
//                 await metaAdCreatorServiceSolar.createAdCreative(
//                     `Creative-${adSetNameAndAdName}`,
//                     adVideo,
//                     scrapedAd.videoPreviewImageUrl,
//                     fbAdSettings
//                 );

//             const ad: Ad = await metaAdCreatorServiceSolar.createAd({
//                 name: adSetNameAndAdName,
//                 adSet,
//                 adCreative,
//             });

//             const { fileCloudStorageUri } = await uploadVideoToStorage(
//                 `${adSetNameAndAdName}.mp4`,
//                 scrapedVideoFileUrl
//             );

//             const createdFbAd: CreatedFbAdInfo = {
//                 campaignId,
//                 adSetId: adSet.id,
//                 adSetName: adSetNameAndAdName,
//                 creativeId: adCreative.id,
//                 adId: ad.id,
//                 videoId: adVideo.id,
//                 videoCloudStorageUri: fileCloudStorageUri,
//                 videoHash,
//             };

//             await saveFbAdFirestore('SOLAR', scrapedAd, createdFbAd);
//             await saveVideoHashFirestore(
//                 'SOLAR',
//                 videoHash,
//                 adSetNameAndAdName
//             );

//             res.status(200).send({ code: 'CREATED' });
//         } catch (error) {
//             console.log(error);
//             res.status(500).send(error);
//         }
//     }
// );

// /*
// Trying to get video source from Ad ID. I dont think we can due to permissions
// */
// export const getAdInfo = onRequest(async (req: Request, res: Response) => {
//     try {
//         const adId = String(req.query.ad_id);

//         if (!adId) {
//             res.status(400).json({
//                 error: 'Missing required parameter: adId',
//             });
//             return;
//         }

//         const accountId = process.env.FACEBOOK_ACCOUNT_ID_OZEMPIC;
//         const metaAdCreatorService = new MetaAdCreatorService({
//             appId: process.env.FACEBOOK_APP_ID || '',
//             appSecret: process.env.FACEBOOK_APP_SECRET || '',
//             accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
//             accountId: accountId || '',
//             apiVersion: '20.0',
//         });

//         // The read() method from the Facebook SDK loads the requested fields into the object's _data property
//         const ad = new Ad(adId);
//         const adData = await ad.read(['id', 'creative']);

//         // Then get the creative details including video_id
//         const creative = new AdCreative(ad._data.creative.id);
//         const creativeData = await creative.read([
//             'id',
//             'video_id',
//             'thumbnail_url',
//             'object_story_spec',
//         ]);

//         // Get video details if video_id exists
//         let videoData = null;
//         if (creativeData.video_id) {
//             const video = new AdVideo(creativeData.video_id);
//             // videoData = await video.read([
//             //     'id',
//             //     'source', // URL to the video
//             //     // 'picture', // Thumbnail URL
//             //     // 'thumbnails', // Array of thumbnail URLs
//             //     // 'title',
//             //     // 'description',
//             // ]);
//             console.log(video);
//         }

//         res.status(200).json({
//             code: 'SUCCESS',
//             error: '',
//             payload: {
//                 // ad: adData,
//                 // creative: creativeData,
//                 video: videoData,
//             },
//         });
//     } catch (error) {
//         console.error('Error fetching ad info:', error);
//         res.status(500).json({
//             code: 'ERROR',
//             error: error,
//         });
//     }
// });

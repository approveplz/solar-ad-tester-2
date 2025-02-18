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
    AdSet,
    AdVideo,
    //@ts-ignore
    Campaign,
} from 'facebook-nodejs-business-sdk';
import {
    getFbAdSettingFirestore,
    getIncrementedCounterFirestore,
    saveAdPerformanceFirestore,
    getAdPerformanceFirestoreById,
    setEventFirestore,
    AD_PERFORMANCE_COLLECTION,
} from './firestoreCloud.js';
import {
    getSignedUploadUrl,
    getSignedDownloadUrl,
} from './firebaseStorageCloud.js';
import { AdPerformance } from './models/AdPerformance.js';
import { BigQueryService } from './services/BigQueryService.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
    CreatomateMetadata,
    CreatomateService,
} from './services/CreatomateService.js';
import { MediaBuyingService } from './services/MediaBuyingService.js';
import { SkypeService } from './services/SkypeService.js';
import { getAdName } from './helpers.js';
import { AD_ACCOUNT_DATA } from './adAccountConfig.js';
import { AirtableService } from './services/AirtableService.js';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { ApifyService } from './services/ApifyService.js';
import { GoogleGeminiService } from './services/GoogleGeminiService.js';
import { OpenAiService } from './services/OpenAiService.js';

config();

const UUID_FIELD_NAME = 'uuid';
const AD_TYPE_FIELD_NAME = 'ad_type';
const ACCOUNT_ID_FIELD_NAME = 'account_id';
const IMAGE_BYTES_FIELD_NAME = 'image_bytes';

initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: 'solar-ad-tester-2.appspot.com',
});

export const getFbAdSettings = async (accountId: string) => {
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

export const updateAdPerformanceScheduled = onSchedule(
    { schedule: 'every 1 hours', timeoutSeconds: 540 },
    async () => {
        try {
            const creatomateService = await CreatomateService.create(
                process.env.CREATOMATE_API_KEY || ''
            );
            const bigQueryService = new BigQueryService();
            const skypeService = new SkypeService(
                process.env.MICROSOFT_APP_ID || '',
                process.env.MICROSOFT_APP_PASSWORD || ''
            );
            const mediaBuyingService = new MediaBuyingService(
                creatomateService,
                bigQueryService,
                skypeService
            );
            await mediaBuyingService.handleAdPerformanceUpdates();
        } catch (error) {
            console.error('Error updating ad performances:', error);
            throw error;
        }
    }
);

// This function keeps Airtable in sync with Firestore by automatically syncing any changes
// (creates, updates, NOT deletes) from the AD_PERFORMANCE_COLLECTION in Firestore to the
// corresponding records in Airtable

export const syncAdPerformance = onDocumentWritten(
    `${AD_PERFORMANCE_COLLECTION}/{docId}`,
    async (event) => {
        const airtableService = new AirtableService(
            process.env.AIRTABLE_API_KEY || '',
            process.env.AIRTABLE_BASE_ID || ''
        );

        const docId = event.params.docId;

        // If the document was deleted, event.data?.after will be undefined.
        if (!event.data?.after.exists) {
            console.log(`Document ${docId} was deleted. Skipping sync.`);
            return;
        }

        // "event.data.after" is a DocumentSnapshot which contains both metadata and the actual data.
        // We use ".data()" to extract only the plain object holding the document's fields.
        const data = event.data.after.data() as AdPerformance;

        try {
            await airtableService.createOrUpdateRecord(docId, data);
            console.log(`Synced document ${docId} to Airtable`);
        } catch (error) {
            console.error(`Failed to sync document ${docId}:`, error);
        }
    }
);

/******************************************************************************
 * HTTP Production endpoints
 ******************************************************************************/

// Called from Google Apps Script
export const createFbAdHttp = onRequest(
    { timeoutSeconds: 540 },
    async (req, res) => {
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
                    error: `Missing required fields: ${missingFields.join(
                        ', '
                    )}`,
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

            const { campaignId, scalingCampaignId } = adAccountData;
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
            const fbAdSetId = await metaAdCreatorService.getAdSetIdFromAdId(
                fbAdId
            );

            const adPerformance: AdPerformance = {
                counter: nextCounter,
                fbAccountId: accountId,
                adName,
                gDriveDownloadUrl: downloadUrl,
                fbAdId,
                fbAdSetId,
                fbCampaignId: campaignId,
                fbScalingCampaignId: scalingCampaignId,
                vertical,
                ideaWriter,
                scriptWriter,
                hookWriter,
                performanceMetrics: {},
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
    }
);

// Called when the Creatomate render is finished
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

    await setEventFirestore(
        `creatomate_render:${creatomateRenderId}`,
        'SUCCESS',
        {
            creatomateMetadata: metadata,
            creatomateUrl,
        }
    );

    res.status(200).json({ success: true });
});

// Called when the Azure bot recieves a message from Skype
//https://us-central1-solar-ad-tester-2.cloudfunctions.net/handleIncomingSkypeMessageHttp
export const handleIncomingSkypeMessageHttp = onRequest(async (req, res) => {
    const skypeService = new SkypeService(
        process.env.MICROSOFT_APP_ID || '',
        process.env.MICROSOFT_APP_PASSWORD || ''
    );
    await skypeService.handleIncomingMessage(req, res);
});

interface GetSignedUploadUrlRequestQuery {
    [AD_TYPE_FIELD_NAME]?: string;
    [UUID_FIELD_NAME]?: string;
    [ACCOUNT_ID_FIELD_NAME]?: string;
}
export interface GetSignedUploadUrlResponsePayload {
    uploadUrl: string;
    fileName: string;
}

// Called by Make.com scenario
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

/******************************************************************************
 * HTTP Function endpoints for testing
 ******************************************************************************/

export const handleGoogleGeminiRequestHttp_TEST = onRequest(
    { timeoutSeconds: 300 },
    async (req, res) => {
        const googleGeminiService = new GoogleGeminiService(
            process.env.GOOGLE_GEMINI_API_KEY || ''
        );
        // const videoUrl =
        //     'https://drive.google.com/uc?export=download&id=1UCO0M0PCv-qiMQjzOx8Sgxsexjcu2-Ri';

        // test 1
        const videoUrl =
            'https://video.ffab1-1.fna.fbcdn.net/v/t42.1790-2/470149424_488208347080994_8952067013063724026_n.?_nc_cat=100&ccb=1-7&_nc_sid=c53f8f&_nc_ohc=IJMA6E1ysGMQ7kNvgEEAe7f&_nc_oc=Adin26crC_mDaT_ifyywPr6DZIGzCmzO6s58PyvKfyKoETRGbBk2HcRD2QNGcdS69QZup2w_V3sHRfzKuucIhRlT&_nc_zt=28&_nc_ht=video.ffab1-1.fna&_nc_gid=AzyerRuUEV7hBqKWyGbTU5g&oh=00_AYByqkDXoyB58NoQe24JX-K2o1XNCQsslbgRsKrQhFzCfw&oe=67B408F8';
        const result = await googleGeminiService.getAdAnalysis(videoUrl);
        res.status(200).json({ success: true, result });
    }
);

export const handleOpenAiRequestHttp_TEST = onRequest(
    { timeoutSeconds: 300 },
    async (req, res) => {
        const openAiService = new OpenAiService(
            process.env.OPENAI_API_KEY || ''
        );
        await openAiService.buildEmbeddingCache();
        const result = await openAiService.findMostSimilar(
            'The video ad features a man with curly brown hair and a short beard, standing on a sidewalk in a residential neighborhood. He is wearing a black Patagonia puffer vest over a blue and white plaid button-down shirt. The background consists of colorful houses on a steep hill, a paved road with yellow lines, and some greenery. The houses are a mix of architectural styles and colors, including red, brown, and white. He\'s facing the camera and speaking directly to the viewer. The camera is held at approximately chest level. A speech bubble-shaped graphic appears at the bottom left corner, displaying the text, "Reply to johnthebuilder04 comment How Can I Get a New Roof Without Paying Anything?" written in a sans-serif font with a user profile image to the left of the text. As the video progresses, the camera remains mostly steady but there are slight movements as the man walks. In the background, a woman in a black coat walks on the other side of the street. A yellow road sign with a winding arrow and the number 15 is visible. There is also a white sign with black lettering that reads "NO PARKING 10pm - 6am EVERYDAY". The sky appears overcast, and the lighting is soft. At the end of the video, the screen turns black and large white text appears at the top, reading "Tap The Button Below!" followed by a countdown timer displayed in a large white sans-serif font. The numbers count down from 7 to 1, taking up a large portion of the screen. There is no audio, but there is a very short, quick buzz sound at the exact moment the countdown hits "1".'
        );
        res.status(200).json({ success: true, result });
    }
);

export const handleApifyRequestHttp_TEST = onRequest(
    { timeoutSeconds: 300 },
    async (req, res) => {
        const googleGeminiService = new GoogleGeminiService(
            process.env.GOOGLE_GEMINI_API_KEY || ''
        );
        const openAiService = new OpenAiService(
            process.env.OPENAI_API_KEY || ''
        );
        const apifyService = new ApifyService(
            process.env.APIFY_API_TOKEN || '',
            googleGeminiService,
            openAiService
        );
        await apifyService.run2();
        res.status(200).json({ success: true });
    }
);

export const handleCreatomateRequestHttp_TEST = onRequest(async (req, res) => {
    console.log('creatomate request received');

    const creatomateService = await CreatomateService.create(
        process.env.CREATOMATE_API_KEY || ''
    );

    // const baseVideoUrl_720x1280 =
    //     'https://drive.google.com/uc?export=download&id=1OMj1MwqUL2V_r12VEWxWEmfip28WO8s7';
    const baseVideoUrl_360x360 =
        'https://drive.google.com/uc?export=download&id=1ew-u6qi83SgPQZIBi-XwTjYImlk4N7E-';

    const baseVideoUrl_16x9 =
        'https://drive.google.com/uc?export=download&id=1rh5gJXbstIyZUuOuhel7tgfhLJ2tVcSt';

    const baseAdName = '103-R-AZ-AZ-AZ';
    // If I use a real fbAdId it will actually creat the hooks
    const fbAdId = '';
    const result = await creatomateService.uploadToCreatomateWithHooksAll(
        baseVideoUrl_16x9,
        baseAdName,
        fbAdId
    );
    res.status(200).json({ success: true, result });
});

// https://duplicateadsetandadtocampaignhttp-txyabkufvq-uc.a.run.app
export const duplicateAdSetAndAdToCampaignHttp_TEST = onRequest(
    async (req, res) => {
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
            const creatomateService = await CreatomateService.create(
                process.env.CREATOMATE_API_KEY || ''
            );
            const skypeService = new SkypeService(
                process.env.MICROSOFT_APP_ID || '',
                process.env.MICROSOFT_APP_PASSWORD || ''
            );
            const bigQueryService = new BigQueryService();
            const mediaBuyingService = new MediaBuyingService(
                creatomateService,
                bigQueryService,
                skypeService
            );

            const adPerformance = {
                adName: '105-R-AZ-AZ-AZ',
                counter: 105,
                fbAccountId: '467161346185440',
                fbAdId: '120216860324070415',
                fbAdSetId: '120216860308490415',
                fbCampaignId: '120215523703190415',
                fbScalingCampaignId: '120216751824410415',
                gDriveDownloadUrl:
                    'https://drive.google.com/uc?export=download&id=1815gqdRw0PzA7d_sH_dzxqscbV3OD-Ku',
                vertical: 'R',
                ideaWriter: 'AZ',
                scriptWriter: 'AZ',
                hookWriter: 'AZ',
                fbIsActive: true,
                isHook: false,
                isScaled: false,
                hasHooksCreated: false,
                hasScaled: false,
                performanceMetrics: {
                    fb: {
                        last3Days: {
                            clicks: 250,
                            leads: 5,
                            revenue: 7500, // $75
                            roi: 3.0,
                            spend: 2500, // $25
                        },
                        last7Days: {
                            clicks: 600,
                            leads: 12,
                            revenue: 18000, // $180
                            roi: 3.0,
                            spend: 6000, // $60
                        },
                        lifetime: {
                            clicks: 1000,
                            leads: 20,
                            revenue: 30000, // $300
                            roi: 3.0,
                            spend: 10000, // $100
                        },
                    },
                    fbRevenueLast3Days: 7500,
                    fbRevenueLast7Days: 18000,
                    fbRevenueLifetime: 30000,
                    fbRoiLast3Days: 3.0,
                    fbRoiLast7Days: 3.0,
                    fbRoiLifetime: 3.0,
                    fbSpendLast3Days: 2500,
                    fbSpendLast7Days: 6000,
                    fbSpendLifetime: 10000,
                },
            };

            invariant(adPerformance, 'adPerformance must be defined');

            const metaAdCreatorService = new MetaAdCreatorService({
                appId: process.env.FACEBOOK_APP_ID || '',
                appSecret: process.env.FACEBOOK_APP_SECRET || '',
                accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
                accountId,
            });
            await mediaBuyingService.handleScaling(
                adPerformance,
                metaAdCreatorService,
                20000
            );

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
    }
);

export const handleSendSkypeMessageHttp_TEST = onRequest(async (req, res) => {
    const skypeService = new SkypeService(
        process.env.MICROSOFT_APP_ID || '',
        process.env.MICROSOFT_APP_PASSWORD || ''
    );
    const conversationName = 'ALAN';
    const message = 'This is a test from ad bot';

    await skypeService.sendMessage(conversationName, message);
    res.status(200).json({ success: true });
});

export const handleCreateHooksHttp_TEST = onRequest(
    { timeoutSeconds: 300 },
    async (req, res) => {
        const creatomateService = await CreatomateService.create(
            process.env.CREATOMATE_API_KEY || ''
        );
        const skypeService = new SkypeService(
            process.env.MICROSOFT_APP_ID || '',
            process.env.MICROSOFT_APP_PASSWORD || ''
        );
        const bigQueryService = new BigQueryService();
        const mediaBuyingService = new MediaBuyingService(
            creatomateService,
            bigQueryService,
            skypeService
        );
        const adPerformance = {
            adName: '105-R-AZ-AZ-AZ',
            counter: 105,
            fbAccountId: '467161346185440',
            fbAdId: '120216860324070415',
            fbAdSetId: '120216860308490415',
            fbCampaignId: '120215523703190415',
            fbScalingCampaignId: '120216751824410415',
            gDriveDownloadUrl:
                'https://drive.google.com/uc?export=download&id=1815gqdRw0PzA7d_sH_dzxqscbV3OD-Ku',
            vertical: 'R',
            ideaWriter: 'AZ',
            scriptWriter: 'AZ',
            hookWriter: 'AZ',
            fbIsActive: true,
            isHook: false,
            isScaled: false,
            hasHooksCreated: false,
            hasScaled: false,
            performanceMetrics: {
                fb: {
                    last3Days: {
                        clicks: 250,
                        leads: 5,
                        revenue: 7500, // $75
                        roi: 1.4,
                        spend: 2500, // $25
                    },
                    last7Days: {
                        clicks: 600,
                        leads: 12,
                        revenue: 18000, // $180
                        roi: 1.4,
                        spend: 6000, // $60
                    },
                    lifetime: {
                        clicks: 1000,
                        leads: 20,
                        revenue: 30000, // $300
                        roi: 1.4,
                        spend: 10000, // $100
                    },
                },
            },
        };

        invariant(adPerformance, 'adPerformance must be defined');

        const metaAdCreatorService = new MetaAdCreatorService({
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
            accountId: adPerformance.fbAccountId,
        });
        await mediaBuyingService.handlePerformanceBasedActions(
            adPerformance,
            metaAdCreatorService,
            skypeService
        );
        res.status(200).json({ success: true });
    }
);

/*
TODO: Fix this after refactor to read params by ad account ID instead of ad type
*/
// export const createImageAdFromHttp = onRequest(async (req, res) => {
//     try {
//         console.log('createImageAdFromHttp handler received request');

//         const accountId = process.env.FACEBOOK_ACCOUNT_ID_OZEMPIC;
//         const metaAdCreatorService = new MetaAdCreatorService({
//             appId: process.env.FACEBOOK_APP_ID || '',
//             appSecret: process.env.FACEBOOK_APP_SECRET || '',
//             accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
//             accountId: accountId || '',
//             apiVersion: '20.0',
//         });

//         const uuid = req.body[UUID_FIELD_NAME];
//         const imageBytes = req.body[IMAGE_BYTES_FIELD_NAME];
//         const adType = req.body[AD_TYPE_FIELD_NAME];

//         const adSetNameAndAdName = `${uuid}-AZ`;

//         const fbAdSettings = await getFbAdSettings(adType);

//         const campaignId = process.env.CAMPAIGN_ID_FOR_467161346185440; // Read Campaign ID
//         invariant(campaignId, 'empty ozempic campaign ID');

//         const adSet: AdSet = await metaAdCreatorService.createAdSet({
//             name: adSetNameAndAdName,
//             campaignId,
//             fbAdSettings,
//         });

//         const adImage: AdImage = await metaAdCreatorService.uploadAdImage(
//             imageBytes
//         );

//         // const name = adImage._data.images.bytes.name;
//         // const hash = adImage._data.images.bytes.hash;

//         const adCreative = await metaAdCreatorService.createAdCreativeImage(
//             adSetNameAndAdName,
//             adImage,
//             fbAdSettings,
//             adType
//         );

//         // console.log({ adCreative });

//         const ad: Ad = await metaAdCreatorService.createAd({
//             name: adSetNameAndAdName,
//             adSet,
//             adCreative,
//         });

//         // console.log({ adImage });
//         res.status(200).json({
//             code: 'SUCESS',
//             error: '',
//             payload: {
//                 ad_id: ad.id,
//             },
//         });
//     } catch (error) {
//         console.error('Error in test handler:', error);

//         res.status(500).json({
//             code: 'ERROR',
//             error: error,
//         });
//     }
// });

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

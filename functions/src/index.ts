import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'express';
import { initializeApp, cert } from 'firebase-admin/app';
import {
    getAccountIdFromVertical,
    invariant,
    VerticalCodes,
    MediaBuyerCodes,
} from './helpers.js';
import serviceAccount from './solar-ad-tester-2-firebase-adminsdk-3iokc-bd8ce8732d.json' assert { type: 'json' };
import { config } from 'dotenv';
import MetaAdCreatorService from './services/MetaAdCreatorService.js';

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
    saveTelegramScriptDataFirestore,
    TelegramScriptData,
} from './firestoreCloud.js';
import {
    getSignedUploadUrl,
    getSignedDownloadUrl,
    uploadCsvToStorage,
    uploadFileToStorage,
    downloadFileFromStorage,
} from './firebaseStorageCloud.js';
import { AdPerformance } from './models/AdPerformance.js';
import { BigQueryService } from './services/BigQueryService.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
    CreatomateMetadata,
    CreatomateService,
} from './services/CreatomateService.js';
import { MediaBuyingService } from './services/MediaBuyingService.js';
import { TelegramService, TelegramUpdate } from './services/TelegramService.js';
import { getAdName, getFullVerticalName } from './helpers.js';
import { AD_ACCOUNT_DATA } from './adAccountConfig.js';
import { AirtableService } from './services/AirtableService.js';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { ApifyService } from './services/ApifyService.js';
import { GoogleGeminiService } from './services/GoogleGeminiService.js';
import { OpenAiService } from './services/OpenAiService.js';
import { TrelloService } from './services/TrelloService.js';
import { Readable } from 'stream';
import { ZipcodeService } from './services/ZipcodeService.js';

config();

const UUID_FIELD_NAME = 'uuid';
const AD_TYPE_FIELD_NAME = 'ad_type';
const ACCOUNT_ID_FIELD_NAME = 'account_id';

initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: 'solar-ad-tester-2.appspot.com',
});

export const updateAdPerformanceScheduled = onSchedule(
    {
        schedule: 'every 1 hours',
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async () => {
        try {
            const creatomateService = await CreatomateService.create(
                process.env.CREATOMATE_API_KEY || ''
            );
            const bigQueryService = new BigQueryService();
            const telegramService = new TelegramService(
                process.env.TELEGRAM_BOT_TOKEN || ''
            );
            const trelloService = new TrelloService(
                process.env.TRELLO_API_KEY || '',
                process.env.TRELLO_API_TOKEN || ''
            );
            const mediaBuyingService = new MediaBuyingService(
                creatomateService,
                bigQueryService,
                telegramService,
                trelloService
            );
            await mediaBuyingService.handleAdPerformanceUpdates();
        } catch (error) {
            console.error('Error updating ad performances:', error);
            throw error;
        }
    }
);

export const fetchAdsScheduled = onSchedule(
    {
        schedule: '0 8,12,16,20 * * *',
        timeZone: 'America/Chicago',
        timeoutSeconds: 180,
        memory: '1GiB',
    },
    async () => {
        try {
            // Define an array of account IDs to fetch ads for
            const accountIds = [
                // '467161346185440', // Vincent, Roofing
                '358423827304360', // Marcus, Roofing
                '822357702553382', // GLP-1
                // Add more account IDs here as needed
            ];
            const onlyActive = true;

            // Create required services
            const creatomateService = await CreatomateService.create(
                process.env.CREATOMATE_API_KEY || ''
            );
            const bigQueryService = new BigQueryService();
            const telegramService = new TelegramService(
                process.env.TELEGRAM_BOT_TOKEN || ''
            );
            const trelloService = new TrelloService(
                process.env.TRELLO_API_KEY || '',
                process.env.TRELLO_API_TOKEN || ''
            );
            const mediaBuyingService = new MediaBuyingService(
                creatomateService,
                bigQueryService,
                telegramService,
                trelloService
            );

            // Fetch ads for each account ID
            const results = await Promise.all(
                accountIds.map(async (accountId) => {
                    try {
                        const newAdsCount =
                            await mediaBuyingService.getAdsForAccountId(
                                accountId,
                                onlyActive
                            );
                        return { accountId, success: true, newAdsCount };
                    } catch (error) {
                        console.error(
                            `Error fetching ads for account ID ${accountId}:`,
                            error
                        );
                        return {
                            accountId,
                            success: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        };
                    }
                })
            );

            console.log(
                'Fetch ads scheduled task completed with results:',
                results
            );
        } catch (error) {
            console.error('Error in scheduled ads fetch:', error);
            throw error;
        }
    }
);

// /**
//  * Creates daily Trello cards for Adstronaut requesting new creatives, including scripts.
//  */
// export const createDailyTrelloCards = onSchedule(
//     {
//         schedule: 'every day 08:00',
//         timeoutSeconds: 180,
//         memory: '1GiB',
//     },
//     async () => {
//         try {
//             const roofingCardQuantity = 2;
//             const glp1CardQuantity = 5;
//             const trelloService = new TrelloService(
//                 process.env.TRELLO_API_KEY || '',
//                 process.env.TRELLO_API_TOKEN || ''
//             );

//             // Create a card name with today's date
//             const roofingCardName = trelloService.getCardName(
//                 'Roofing',
//                 'New Script & Creatives',
//                 roofingCardQuantity
//             );

//             const glp1CardName = trelloService.getCardName(
//                 'GLP-1',
//                 'New Script & Creatives',
//                 glp1CardQuantity
//             );

//             // Create the Trello card
//             const roofingTrelloCard =
//                 await trelloService.createCardFromTemplateAuto(
//                     roofingCardName,
//                     'Roofing',
//                     roofingCardQuantity
//                 );

//             const glp1TrelloCard =
//                 await trelloService.createCardFromTemplateAuto(
//                     glp1CardName,
//                     'GLP-1',
//                     glp1CardQuantity
//                 );
//             console.log(
//                 `Created daily Trello cards: ${roofingCardName}, ${glp1CardName}`
//             );
//             return;
//         } catch (error) {
//             console.error('Error creating daily roofing Trello card:', error);
//             throw error;
//         }
//     }
// );

// // This function keeps Airtable in sync with Firestore by automatically syncing any changes
// // (creates, updates, NOT deletes) from the AD_PERFORMANCE_COLLECTION in Firestore to the
// // corresponding records in Airtable

// export const syncAdPerformance = onDocumentWritten(
//     `${AD_PERFORMANCE_COLLECTION}/{docId}`,
//     async (event) => {
//         const airtableService = new AirtableService(
//             process.env.AIRTABLE_API_KEY || '',
//             process.env.AIRTABLE_BASE_ID || ''
//         );

//         const docId = event.params.docId;

//         // If the document was deleted, event.data?.after will be undefined.
//         if (!event.data?.after.exists) {
//             console.log(`Document ${docId} was deleted. Skipping sync.`);
//             return;
//         }

//         // "event.data.after" is a DocumentSnapshot which contains both metadata and the actual data.
//         // We use ".data()" to extract only the plain object holding the document's fields.
//         const data = event.data.after.data() as AdPerformance;

//         try {
//             await airtableService.createOrUpdateRecord(docId, data);
//             console.log(`Synced document ${docId} to Airtable`);
//         } catch (error) {
//             console.error(`Failed to sync document ${docId}:`, error);
//         }
//     }
// );

// export const saveFilteredRoofingZipsScheduled = onSchedule(
//     { schedule: 'every day 12:00', timeoutSeconds: 180, memory: '2GiB' },
//     async () => {
//         try {
//             const zipcodeService = new ZipcodeService();
//             const roofingRecordsObj =
//                 await zipcodeService.getCurrentCsvRecords();
//             const { date } = roofingRecordsObj;

//             const roofingRecordsObjJson = JSON.stringify(
//                 roofingRecordsObj,
//                 null,
//                 2
//             );
//             const nodeStream = Readable.from([roofingRecordsObjJson]);
//             const fileName = `affiliate_demand_${date}.json`;

//             const { fileCloudStorageUri } = await uploadFileToStorage(
//                 nodeStream,
//                 'roofing-zips-filtered',
//                 fileName,
//                 'application/json'
//             );

//             console.log(
//                 `Filtered roofing ZIPs JSON file stored at: ${fileCloudStorageUri}`
//             );
//         } catch (error: unknown) {
//             console.error(
//                 'Error during scheduled filtered roofing ZIPs task:',
//                 error
//             );
//             throw error;
//         }
//     }
// );

// export const saveRoofingZipsHttp = onRequest(
//     { timeoutSeconds: 180 },
//     async (req: Request, res: Response) => {
//         try {
//             // Instantiate the ZipcodeService to fetch, parse, and filter CSV records.
//             const zipcodeService = new ZipcodeService();
//             const roofingRecordsObj =
//                 await zipcodeService.getCurrentCsvRecords();
//             const { date, records } = roofingRecordsObj;

//             const roofingRecordsObjJson = JSON.stringify(
//                 roofingRecordsObj,
//                 null,
//                 2
//             );

//             // Convert the JSON string to a Node.js stream.
//             const nodeStream = Readable.from([roofingRecordsObjJson]);

//             // Define the file name with a .json extension.
//             const fileName = `affiliate_demand_${date}.json`;

//             // Upload the JSON file to storage.
//             const { fileCloudStorageUri } = await uploadFileToStorage(
//                 nodeStream,
//                 'roofing-zips-filtered',
//                 fileName,
//                 'application/json'
//             );
//             console.log(`JSON file stored at: ${fileCloudStorageUri}`);

//             res.status(200).json({
//                 success: true,
//                 fileCloudStorageUri,
//                 roofingRecordsObj,
//             });
//         } catch (error: unknown) {
//             console.error('Error during HTTP roofing ZIPs task:', error);
//             res.status(500).json({
//                 success: false,
//                 error: error instanceof Error ? error.message : String(error),
//             });
//         }
//     }
// );

/******************************************************************************
 * HTTP Production endpoints
 ******************************************************************************/

// Called from Google Apps Script
export const createRecordAirtableAdAutomationHttp = onRequest(
    { timeoutSeconds: 540, memory: '1GiB' },
    async (req, res) => {
        const airtableService = new AirtableService(
            process.env.AIRTABLE_API_KEY || '',
            process.env.AIRTABLE_BASE_ID || ''
        );

        let {
            downloadUrl,
            vertical,
            scriptWriter,
            ideaWriter,
            hookWriter,
            mediaType,
        } = req.body;

        if (!Object.values(VerticalCodes).includes(vertical)) {
            vertical = null;
        }

        if (!Object.values(MediaBuyerCodes).includes(scriptWriter)) {
            scriptWriter = null;
        }
        if (!Object.values(MediaBuyerCodes).includes(ideaWriter)) {
            ideaWriter = null;
        }
        if (!Object.values(MediaBuyerCodes).includes(hookWriter)) {
            hookWriter = null;
        }

        const recordId = await airtableService.updateAdAutomationRecord(
            downloadUrl,
            vertical,
            scriptWriter,
            ideaWriter,
            hookWriter,
            mediaType
        );

        res.status(200).json({ success: true, recordId });
    }
);

export const createFbAdHttp = onRequest(
    { timeoutSeconds: 540, memory: '1GiB' },
    async (req, res) => {
        const creatomateService = await CreatomateService.create(
            process.env.CREATOMATE_API_KEY || ''
        );
        const bigQueryService = new BigQueryService();
        const telegramService = new TelegramService(
            process.env.TELEGRAM_BOT_TOKEN || ''
        );
        const trelloService = new TrelloService(
            process.env.TRELLO_API_KEY || '',
            process.env.TRELLO_API_TOKEN || ''
        );
        const mediaBuyingService = new MediaBuyingService(
            creatomateService,
            bigQueryService,
            telegramService,
            trelloService
        );

        console.log(`Request body: ${JSON.stringify(req.body, null, 2)}`);

        try {
            // Validate required request body parameters
            const requiredFields = [
                'downloadUrl',
                'vertical',
                'scriptWriter',
                'ideaWriter',
                'hookWriter',
                'mediaBuyer',
                'adName',
                'mediaType',
            ];
            const missingFields = requiredFields.filter(
                (field) => !req.body[field]
            );

            if (missingFields.length > 0) {
                console.error(
                    `Missing required fields: ${missingFields.join(', ')}`
                );
                res.status(400).json({
                    success: false,
                    error: `Missing required fields: ${missingFields.join(
                        ', '
                    )}`,
                });
                return;
            }

            const {
                downloadUrl,
                vertical,
                scriptWriter,
                ideaWriter,
                hookWriter,
                mediaBuyer,
                adName,
                scriptId,
                mediaType,
                isTest = false,
            } = req.body;

            console.log(`Automation running for ${adName}`);

            const accountId = getAccountIdFromVertical(vertical);

            const adAccountData =
                AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA];
            invariant(
                adAccountData,
                `ad account data not found in constants for account id: ${accountId}`
            );
            const { campaignIds } = adAccountData;
            const campaignId =
                campaignIds[mediaBuyer as keyof typeof campaignIds];

            invariant(
                campaignId,
                `campaign id not found in constants for account id: ${accountId} and media buyer: ${mediaBuyer}`
            );

            const metaAdCreatorService = new MetaAdCreatorService({
                appId: process.env.FACEBOOK_APP_ID || '',
                appSecret: process.env.FACEBOOK_APP_SECRET || '',
                accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
                accountId: accountId || '',
            });

            let ad;

            if (mediaType === 'VIDEO') {
                ad = await mediaBuyingService.handleCreateVideoAd(
                    metaAdCreatorService,
                    accountId,
                    campaignId,
                    adName,
                    downloadUrl
                );
            } else {
                ad = await mediaBuyingService.handleCreateImageAd(
                    metaAdCreatorService,
                    accountId,
                    campaignId,
                    adName,
                    downloadUrl
                );
            }

            if (isTest) {
                res.status(200).json({
                    success: true,
                });
            }

            const fbAdId = ad.id;
            const fbAdSetId = await metaAdCreatorService.getAdSetIdFromAdId(
                fbAdId
            );

            const adPerformance: AdPerformance = {
                scriptId,
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
                performanceMetrics: {},
                fbIsActive: true,
                mediaBuyer,
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

export const generateScriptHttp = onRequest(async (req, res) => {
    const { idea, creator = '', vertical = '', notes = '' } = req.body;

    const openAiService = new OpenAiService(process.env.OPENAI_API_KEY || '');

    const scripts = await Promise.all([
        openAiService.generateScript(idea, vertical, notes),
        openAiService.generateScript(idea, vertical, notes),
        openAiService.generateScript(idea, vertical, notes),
    ]);

    const telegramService = new TelegramService(
        process.env.TELEGRAM_BOT_TOKEN || ''
    );

    for (let i = 0; i < scripts.length; i++) {
        const { script } = scripts[i];
        const message = `#${
            i + 1
        } New script generated for ${getFullVerticalName(vertical)}:
    
${script}

Please approve or reject this script.
`;

        // Create a shorter scriptId by using a truncated timestamp in base36
        // This creates a much shorter but still unique ID
        // This is because Telegram callback data is limited to 64 bytes
        const timestamp = Date.now();
        const shortTimestamp = timestamp.toString(36); // Convert to base36 for shorter representation
        const scriptId = `s_${shortTimestamp}`;

        const scriptData: TelegramScriptData = {
            idea,
            creator,
            vertical,
            notes,
            script,
            scriptIndex: i,
        };

        await saveTelegramScriptDataFirestore(scriptId, scriptData);
        console.log(`Saved script to Firestore with ID: ${scriptId}`);

        const mediaBuyerChatId = telegramService.mediaBuyerChatIds[creator];
        console.log(
            `Sending message to media buyer chat ID: ${mediaBuyerChatId}`
        );

        await telegramService.sendMessageWithApprovalButtons(
            mediaBuyerChatId,
            message,
            scriptId
        );
    }

    res.status(200).json({
        success: true,
    });
});

/**
 * Handles Telegram webhook requests for script approval/rejection
 * This endpoint processes callback queries (button clicks) from Telegram users
 * when they approve or reject generated scripts via inline keyboard buttons.
 * The webhook is automatically called by Telegram when users interact with the bot for script approval/rejection.
 */
export const handleTelegramWebhookHttp = onRequest(async (req, res) => {
    try {
        const update: TelegramUpdate = req.body;

        const telegramService = new TelegramService(
            process.env.TELEGRAM_BOT_TOKEN || ''
        );

        // Process the update using the TelegramService
        const result = await telegramService.handleWebhook(update);

        if (!result.success) {
            console.error('Error processing webhook:', result.error);
        }

        // Always respond with 200 OK to Telegram to acknowledge the webhook
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error handling Telegram webhook:', error);
        // Still return 200 to Telegram to prevent them from retrying
        res.status(200).send('Error processed');
    }
});

/**
 * Sets up the webhook URL for Telegram bot
 * This only needs to be called once or when you want to change the webhook URL
 */
export const setupTelegramWebhookHttp = onRequest(async (req, res) => {
    try {
        const telegramService = new TelegramService(
            process.env.TELEGRAM_BOT_TOKEN || ''
        );

        const result = await telegramService.setWebhook(
            telegramService.webhookUrl
        );

        res.status(200).json({
            success: true,
            webhookUrl: telegramService.webhookUrl,
            result,
        });
    } catch (error) {
        console.error('Error setting up Telegram webhook:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});

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

export const handleApifyRequestHttp_TEST = onRequest(
    { timeoutSeconds: 500 },
    async (req, res) => {
        const googleGeminiService = new GoogleGeminiService(
            process.env.GOOGLE_GEMINI_API_KEY || ''
        );
        const openAiService = new OpenAiService(
            process.env.OPENAI_API_KEY || ''
        );
        const telegramService = new TelegramService(
            process.env.TELEGRAM_BOT_TOKEN || ''
        );
        const apifyService = new ApifyService(
            process.env.APIFY_API_TOKEN || '',
            googleGeminiService,
            openAiService
        );
        const hasNewAdsArr = await Promise.allSettled([
            apifyService.execute(apifyService.ROOFING_QUOTE_ORG_PAGE_ID),
            apifyService.execute(apifyService.COST_GUIDE_PAGE_ID),
            apifyService.execute(apifyService.TRUSTED_ROOF_EXPERTS),
            apifyService.execute(apifyService.HOME_IMPROVEMENT_QUOTES),
            apifyService.execute(apifyService.ROOF_REPLACEMENT_PROGRAM),
        ]);

        const hasNewAds = hasNewAdsArr.some(
            (result) => result.status === 'fulfilled' && result.value
        );

        if (hasNewAds) {
            await telegramService.sendMessage(
                telegramService.mediaBuyerChatIds['AZ'],
                'There are new scraped ads ready for review at https://solar-ad-tester-2.web.app/'
            );
        }
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

// /**
//  * Test endpoint to create a script record in Airtable
//  * This endpoint allows testing the createScriptRecord functionality
//  */
// export const testCreateScriptRecordHttp = onRequest(
//     { timeoutSeconds: 60 },
//     async (req, res) => {
//         try {
//             // Validate required request body parameters
//             const requiredFields = ['scriptId', 'writer', 'vertical', 'script'];
//             const missingFields = requiredFields.filter(
//                 (field) => !req.body[field]
//             );

//             if (missingFields.length > 0) {
//                 res.status(400).json({
//                     success: false,
//                     error: `Missing required fields: ${missingFields.join(
//                         ', '
//                     )}`,
//                 });
//                 return;
//             }

//             const { scriptId, writer, vertical, script } = req.body;

//             // Initialize AirtableService
//             const airtableService = new AirtableService(
//                 process.env.AIRTABLE_API_KEY || '',
//                 process.env.AIRTABLE_BASE_ID || ''
//             );

//             // Create the script record
//             const recordId = await airtableService.createScriptRecord(
//                 scriptId,
//                 writer,
//                 vertical,
//                 script
//             );

//             res.status(200).json({
//                 success: true,
//                 recordId,
//                 message: `Successfully created script record with ScriptID: ${scriptId}`,
//             });
//         } catch (error) {
//             console.error('Error creating script record:', error);
//             res.status(500).json({
//                 success: false,
//                 error: error instanceof Error ? error.message : String(error),
//             });
//         }
//     }
// );

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

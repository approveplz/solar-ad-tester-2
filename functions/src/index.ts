import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { Request, Response } from 'express';
import { initializeApp, cert } from 'firebase-admin/app';
import {
    getAccountIdFromVertical,
    invariant,
    VerticalCodes,
    MediaBuyerCodes,
} from './helpers.js';
// @ts-ignore: Import assertions are still valid syntax
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
    AdPerformance,
    AdPerformanceByAdName,
} from './models/AdPerformance.js';
import { BigQueryService } from './services/BigQueryService.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
    CreatomateMetadata,
    CreatomateService,
} from './services/CreatomateService.js';
import { MediaBuyingService } from './services/MediaBuyingService.js';
import { TelegramService, TelegramUpdate } from './services/TelegramService.js';
import {
    getAdName,
    getFullVerticalName,
    getViewUrlFromGdriveDownloadUrl,
} from './helpers.js';
import { AD_ACCOUNT_DATA } from './adAccountConfig.js';
import { AirtableService } from './services/AirtableService.js';
import { ApifyService } from './services/ApifyService.js';
import { GoogleGeminiService } from './services/GoogleGeminiService.js';
import { OpenAiService } from './services/OpenAiService.js';
import { TrelloService } from './services/TrelloService.js';
import { Readable } from 'stream';
import { ZipcodeService } from './services/ZipcodeService.js';

config();

initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: 'solar-ad-tester-2.appspot.com',
});

export const fetchAdsScheduled = onSchedule(
    {
        schedule: '0 8,12,16,20 * * *',
        timeZone: 'America/Chicago',
        timeoutSeconds: 300,
        memory: '1GiB',
    },
    async () => {
        try {
            const creatomateService = await CreatomateService.create(
                process.env.CREATOMATE_API_KEY || ''
            );
            const bigQueryService = new BigQueryService();
            const openAiService = new OpenAiService(
                process.env.OPENAI_API_KEY || ''
            );
            const telegramService = new TelegramService(
                process.env.TELEGRAM_BOT_TOKEN || '',
                openAiService
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
            await mediaBuyingService.handleFbAdSync();
        } catch (error) {
            console.error('Error in fetchAdsScheduled:', error);
            throw error;
        }
    }
);

// Aggregates FB performance metrics by ad name every 4 hours and stores them in ad-performance-by-ad-name collection
export const aggregateAdPerformanceByAdNameScheduled = onSchedule(
    {
        schedule: '0 */4 * * *', // Every 4 hours
        timeZone: 'America/Chicago',
        timeoutSeconds: 300,
        memory: '1GiB',
    },
    async () => {
        try {
            await MediaBuyingService.aggregateAdPerformanceByAdName();
        } catch (error) {
            console.error(
                'Error running aggregateAdPerformanceByAdNameScheduled:',
                error
            );
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

// This function keeps Airtable in sync with Firestore by automatically syncing any changes
// (creates, updates, NOT deletes) from the AD_PERFORMANCE_COLLECTION in Firestore to the
// corresponding records in Airtable
export const syncAdPerformance = onDocumentWritten(
    `${AD_PERFORMANCE_COLLECTION}/{docId}`,
    async (event) => {
        console.log('syncAdPerformance function triggered');

        const airtableService = new AirtableService(
            process.env.AIRTABLE_API_KEY || '',
            process.env.AIRTABLE_BASE_ID || ''
        );

        const docId = event.params.docId;
        console.log(`Processing document change for docId: ${docId}`);

        // If the document was deleted, event.data?.after will be undefined.
        if (!event.data?.after.exists) {
            console.log(`Document ${docId} was deleted. Skipping sync.`);
            return;
        }

        // "event.data.after" is a DocumentSnapshot which contains both metadata and the actual data.
        // We use ".data()" to extract only the plain object holding the document's fields.
        const data = event.data.after.data() as AdPerformance;
        console.log(`Extracted AdPerformance data for ad: ${data.adName}`);

        try {
            await airtableService.createOrUpdateRecordAdPerformance(data);
            console.log(
                `Successfully synced document ${docId} (${data.adName}) to Airtable`
            );
        } catch (error) {
            console.error(
                `Failed to sync document ${docId} (${data.adName}):`,
                error,
                'Full AdPerformance data structure:',
                JSON.stringify(data, null, 2)
            );
            throw error;
        }
    }
);

// This function keeps ad-performance-by-ad-name collection in sync with Airtable by automatically syncing any changes
// (creates, updates, NOT deletes) from the ad-performance-by-ad-name collection in Firestore to the
// corresponding records in the AD_PERFORMANCE_2 table in Airtable
export const syncAdPerformanceByAdName = onDocumentWritten(
    'ad-performance-by-ad-name/{docId}',
    async (event) => {
        console.log('syncAdPerformanceByAdName function triggered');

        const airtableService = new AirtableService(
            process.env.AIRTABLE_API_KEY || '',
            process.env.AIRTABLE_BASE_ID || ''
        );

        const docId = event.params.docId;
        console.log(`Processing document change for docId: ${docId}`);

        // If the document was deleted, event.data?.after will be undefined.
        if (!event.data?.after.exists) {
            console.log(`Document ${docId} was deleted. Skipping sync.`);
            return;
        }

        // "event.data.after" is a DocumentSnapshot which contains both metadata and the actual data.
        // We use ".data()" to extract only the plain object holding the document's fields.
        const data = event.data.after.data() as AdPerformanceByAdName;
        console.log(
            `Extracted AdPerformanceByAdName data for ad: ${data.adName}`
        );

        try {
            await airtableService.createOrUpdateRecordAdPerformanceByAdName(
                data
            );
            console.log(
                `Successfully synced document ${docId} (${data.adName}) to Airtable AD_PERFORMANCE_2`
            );
        } catch (error) {
            console.error(
                `Failed to sync document ${docId} (${data.adName}):`,
                error,
                'Full AdPerformanceByAdName data structure:',
                JSON.stringify(data, null, 2)
            );
            throw error;
        }
    }
);

/**
 * Handles Creatomate render completion events from Firestore
 *
 * FLOW OVERVIEW:
 * 1. Creatomate finishes rendering a video with hooks
 * 2. Creatomate calls our webhook endpoint (handleCreatomateWebhookHttp)
 * 3. The webhook handler processes the payload and calls CreatomateService.handleWebhookCompletion()
 * 4. CreatomateService.handleWebhookCompletion() calls setEventFirestore() to create an event document
 *    in the 'events' collection with the pattern: creatomate_render:{renderId}
 * 5. This function (handleCreatomateRenderCompletion) is automatically triggered by the Firestore
 *    document write and processes the completed render
 *
 * PURPOSE:
 * This function allows us to react to completed Creatomate renders asynchronously and perform
 * additional processing like updating ad performance data, sending notifications, or triggering
 * further workflow steps.
 *
 * TRIGGER: onDocumentWritten for 'events/{eventId}' collection
 * FILTERS: Only processes events that start with 'creatomate_render:'
 */
export const handleCreatomateRenderCompletion = onDocumentWritten(
    'events/{eventId}',
    async (event) => {
        const eventId = event.params.eventId;
        console.log(
            `handleCreatomateRenderCompletion triggered for eventId: ${eventId}`
        );

        // Only process events that match the creatomate_render pattern
        if (!eventId.startsWith('creatomate_render:')) {
            console.log(
                `Event ${eventId} is not a creatomate_render event. Skipping.`
            );
            return;
        }

        // If the document was deleted, skip processing
        if (!event.data?.after.exists) {
            console.log(`Event document ${eventId} was deleted. Skipping.`);
            return;
        }

        const eventData = event.data.after.data();
        console.log(
            `Processing Creatomate render completion event: ${eventId}`,
            eventData
        );

        if (!eventData) {
            throw new Error(`No data found for event: ${eventId}`);
        }

        try {
            // Only process successful renders
            if (eventData.status !== 'SUCCESS') {
                console.log(
                    `Skipping event ${eventId} with status: ${eventData.status}`
                );
                return;
            }

            // Extract data from the event payload
            const { creatomateMetadata, creatomateUrl } = eventData.payload;
            const { baseAdName, hookName, fbAdId } = creatomateMetadata;

            console.log(
                `Processing completed render for ad: ${baseAdName}, hook: ${hookName}`
            );

            // Upload to Google Drive using Google Apps Script
            const googleAppsScriptUrl =
                'https://script.google.com/macros/s/AKfycbxPuQnHXVEzU0o_8iLxcAaM45VPhE98t6w0eTKMN6sVWyegRqy1cSYT34O5QV4DT6MZCQ/exec';

            const uploadUrl = `${googleAppsScriptUrl}?fileUrl=${encodeURIComponent(
                creatomateUrl
            )}&baseAdName=${encodeURIComponent(
                baseAdName
            )}&hookName=${encodeURIComponent(hookName)}`;

            console.log(`Uploading to Google Drive: ${uploadUrl}`);

            const response = await fetch(uploadUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                },
                redirect: 'follow',
            });

            if (!response.ok) {
                throw new Error(
                    `Google Apps Script failed with status: ${response.status}`
                );
            }

            const responseText = await response.text();
            let uploadResult;

            try {
                uploadResult = JSON.parse(responseText);
            } catch (parseError) {
                console.error(
                    'Failed to parse Google Apps Script response:',
                    parseError
                );
                throw new Error(
                    `Invalid response from Google Apps Script: ${responseText}`
                );
            }

            if (uploadResult.status === 'success') {
                console.log(
                    `Successfully uploaded to Google Drive. File ID: ${uploadResult.fileId}`
                );

                // Update AdPerformance document with the new hook info
                let adPerformance = null;

                // First try to get by fbAdId
                if (fbAdId) {
                    console.log(
                        `Looking up AdPerformance by fbAdId: ${fbAdId}`
                    );
                    adPerformance = await getAdPerformanceFirestoreById(fbAdId);
                }

                // If not found by fbAdId, try by baseAdName
                if (!adPerformance && baseAdName) {
                    console.log(
                        `AdPerformance not found by fbAdId, trying baseAdName: ${baseAdName}`
                    );
                    adPerformance = await getAdPerformanceFirestoreById(
                        baseAdName
                    );
                }

                if (adPerformance) {
                    // Initialize hooksCreated array if it doesn't exist
                    if (!adPerformance.hooksCreated) {
                        adPerformance.hooksCreated = [];
                    }

                    // Add the new hook name to the array (hooksCreated is string[])
                    adPerformance.hooksCreated.push(hookName);

                    // Save back to Firestore using the document ID that worked
                    const documentId =
                        fbAdId && (await getAdPerformanceFirestoreById(fbAdId))
                            ? fbAdId
                            : baseAdName;
                    await saveAdPerformanceFirestore(documentId, adPerformance);

                    console.log(
                        `Updated AdPerformance document (${documentId}) with new hook: ${hookName}`
                    );
                } else {
                    console.warn(
                        `AdPerformance document not found for fbAdId: ${fbAdId} or baseAdName: ${baseAdName}`
                    );
                }
            } else {
                throw new Error(
                    `Google Apps Script upload failed: ${uploadResult.message}`
                );
            }

            console.log(
                `Successfully processed Creatomate render completion for event: ${eventId}`
            );
        } catch (error) {
            console.error(
                `Error processing Creatomate render completion for event ${eventId}:`,
                error
            );
            throw error;
        }
    }
);

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
            originalFileName,
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

        const viewUrl = getViewUrlFromGdriveDownloadUrl(downloadUrl);

        const recordId = await airtableService.updateAdAutomationRecord(
            downloadUrl,
            vertical,
            scriptWriter,
            ideaWriter,
            hookWriter,
            mediaType,
            viewUrl,
            originalFileName
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
        const openAiService = new OpenAiService(
            process.env.OPENAI_API_KEY || ''
        );
        const telegramService = new TelegramService(
            process.env.TELEGRAM_BOT_TOKEN || '',
            openAiService
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
                'automationType',
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
                airtableRecordId = '',
                automationType,
            } = req.body;

            console.log(
                `Automation running for ${adName} with automation type: ${automationType}`
            );

            let accountId: string = '';
            let campaignId: string = '';
            let fbAdId: string = '';
            let fbAdSetId: string = '';
            let fbIsActive: boolean = false;

            // Only proceed with Facebook upload if automationType is AUTO_UPLOAD
            if (automationType === 'AUTOUPLOAD') {
                accountId = getAccountIdFromVertical(vertical) || '';

                const adAccountData =
                    AD_ACCOUNT_DATA[accountId as keyof typeof AD_ACCOUNT_DATA];
                invariant(
                    adAccountData,
                    `ad account data not found in constants for account id: ${accountId}`
                );
                const { campaignIds } = adAccountData;
                campaignId =
                    campaignIds[mediaBuyer as keyof typeof campaignIds] || '';

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

                const fbAdSettings = await mediaBuyingService.getFbAdSettings(
                    accountId,
                    mediaBuyer
                );
                invariant(
                    fbAdSettings,
                    `No ad settings found for accountId: ${accountId}`
                );

                let ad;

                if (mediaType === 'VIDEO') {
                    ad = await mediaBuyingService.handleCreateVideoAd(
                        metaAdCreatorService,
                        campaignId,
                        adName,
                        downloadUrl,
                        fbAdSettings
                    );
                } else {
                    ad = await mediaBuyingService.handleCreateImageAd(
                        metaAdCreatorService,
                        campaignId,
                        adName,
                        downloadUrl,
                        fbAdSettings
                    );
                }

                if (isTest) {
                    res.status(200).json({
                        success: true,
                    });
                    return;
                }

                fbAdId = ad.id;
                fbAdSetId = await metaAdCreatorService.getAdSetIdFromAdId(
                    fbAdId
                );
                fbIsActive = true;
            } else if (automationType !== 'MANUAL') {
                throw new Error(
                    `Invalid automation type: ${automationType}. Only AUTOUPLOAD and MANUAL are supported.`
                );
            }

            // Handle Airtable operations for all automation types when airtableRecordId is provided
            if (airtableRecordId) {
                try {
                    // Call Google Apps Script to move to archive folder
                    const appsScriptUrl =
                        'https://script.google.com/macros/s/AKfycbxcnLWBkRRxrnWNMyO9Si2EhWW2HFQQTrLuBmYtOMCLApCUJH0qVLf5Huj4kY8_xxF4/exec';

                    const fullAppScriptUrl = `${appsScriptUrl}?fileUrl=${encodeURIComponent(
                        downloadUrl
                    )}&adName=${encodeURIComponent(adName)}`;

                    console.log(
                        `Making request to Google Apps Script URL: ${fullAppScriptUrl}`
                    );

                    const response = await fetch(fullAppScriptUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                        },
                        redirect: 'follow',
                    });

                    if (response.ok) {
                        console.log(
                            `Successfully called Google Apps Script URL: ${fullAppScriptUrl} for record ID: ${airtableRecordId} to move ${adName} to archive folder`
                        );
                    } else {
                        console.error(
                            `Google Apps Script URL failed with status: ${response.status} for record ID: ${airtableRecordId} to move ${adName} to archive folder`,
                            await response.text()
                        );
                        throw new Error(
                            `Google Apps Script URL failed with status: ${response.status} for record ID: ${airtableRecordId} to move ${adName} to archive folder`
                        );
                    }

                    // Call Airtable webhook to update status
                    const webhookUrl =
                        'https://hooks.airtable.com/workflows/v1/genericWebhook/appLGOqZqpYEgSKum/wflJtj5Qs9eGOAVPD/wtrXvnti0FpmICZC6';

                    const webhookPayload = {
                        airtableRecordId,
                        status: 'SUCCESS',
                    };

                    console.log(
                        `Calling Airtable webhook for record ID: ${airtableRecordId}`
                    );

                    const webhookResponse = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(webhookPayload),
                    });

                    if (webhookResponse.ok) {
                        console.log(
                            `Successfully called Airtable webhook for record ID: ${airtableRecordId} to update status to SUCCESS`
                        );
                    } else {
                        console.error(
                            `Airtable webhook failed with status: ${webhookResponse.status} for record ID: ${airtableRecordId} to update status to SUCCESS`,
                            await webhookResponse.text()
                        );
                    }
                } catch (webhookError) {
                    console.error(
                        'Error calling Airtable webhook:',
                        webhookError
                    );
                    // Don't throw the error - we don't want webhook failures to break the main flow
                }
            }

            res.status(200).json({
                success: true,
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
    try {
        const creatomateService = await CreatomateService.create(
            process.env.CREATOMATE_API_KEY || ''
        );

        const result = await creatomateService.handleWebhookCompletion(
            req.body
        );

        if (!result.success) {
            res.status(500).json({
                success: false,
                error: result.error || 'Creatomate webhook processing failed',
            });
            return;
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error in handleCreatomateWebhookHttp:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

export const generateScriptHttp = onRequest(async (req, res) => {
    const { idea, creator = '', vertical = '', notes = '' } = req.body;

    const openAiService = new OpenAiService(process.env.OPENAI_API_KEY || '');

    // Generate a single script instead of three
    const { script } = await openAiService.generateScript(
        idea,
        vertical,
        notes
    );

    const telegramService = new TelegramService(
        process.env.TELEGRAM_BOT_TOKEN || '',
        openAiService
    );

    const message = `New script generated for ${getFullVerticalName(vertical)}:
    
${script}

Please approve or reject this script.`;

    // Create a shorter scriptId by using a truncated timestamp in base36
    // This creates a much shorter but still unique ID
    // This is because Telegram callback data is limited to 64 bytes
    const timestamp = Date.now();
    const shortTimestamp = timestamp.toString(36); // Convert to base36 for shorter representation
    const scriptId = shortTimestamp;

    const scriptData: TelegramScriptData = {
        idea,
        creator,
        vertical,
        notes,
        script,
    };

    await saveTelegramScriptDataFirestore(scriptId, scriptData);
    console.log(`Saved script to Firestore with ID: ${scriptId}`);

    const mediaBuyerChatId = telegramService.mediaBuyerChatIds[creator];
    console.log(`Sending message to media buyer chat ID: ${mediaBuyerChatId}`);

    await telegramService.sendMessageWithApprovalButtons(
        mediaBuyerChatId,
        message,
        scriptId
    );

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

        const openAiService = new OpenAiService(
            process.env.OPENAI_API_KEY || ''
        );
        const telegramService = new TelegramService(
            process.env.TELEGRAM_BOT_TOKEN || '',
            openAiService
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
        const openAiService = new OpenAiService(
            process.env.OPENAI_API_KEY || ''
        );
        const telegramService = new TelegramService(
            process.env.TELEGRAM_BOT_TOKEN || '',
            openAiService
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

export const redirectToGoogleAppscriptMoveCreativeToArchiveFolder = onRequest(
    { timeoutSeconds: 60 },
    async (req: Request, res: Response) => {
        console.log('Request received:', {
            query: req.query,
            body: req.body,
            method: req.method,
        });

        try {
            // Extract parameters from query string or request body
            const fileUrl = (req.query.fileUrl as string) || req.body.fileUrl;
            const adName = (req.query.adName as string) || req.body.adName;

            console.log('Extracted parameters:', { fileUrl, adName });

            // Validate required parameters
            if (!fileUrl || !adName) {
                console.error('Missing parameters:', { fileUrl, adName });
                res.status(400).json({
                    success: false,
                    error: 'Missing required parameters: fileUrl and adName',
                });
                return;
            }

            // Google Apps Script URL (from your Airtable automation)
            const appsScriptUrl =
                'https://script.google.com/macros/s/AKfycbxcnLWBkRRxrnWNMyO9Si2EhWW2HFQQTrLuBmYtOMCLApCUJH0qVLf5Huj4kY8_xxF4/exec';

            // Construct the full URL with parameters
            const fullUrl = `${appsScriptUrl}?fileUrl=${encodeURIComponent(
                fileUrl
            )}&adName=${encodeURIComponent(adName)}`;

            console.log(`Making request to Google Apps Script URL: ${fullUrl}`);

            // Make the request to Google Apps Script
            const response = await fetch(fullUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                },
                redirect: 'follow',
            });

            console.log(
                `Google Apps Script response status: ${response.status}`
            );
            console.log(
                `Google Apps Script response headers:`,
                Object.fromEntries(response.headers.entries())
            );

            // Get the response text first to see what we're actually getting
            const responseText = await response.text();
            console.log(
                `Google Apps Script response text (first 500 chars):`,
                responseText.substring(0, 500)
            );

            // Check if the response is ok
            if (!response.ok) {
                throw new Error(
                    `Google Apps Script responded with status: ${response.status}`
                );
            }

            // Try to parse as JSON
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse response as JSON:', parseError);
                console.error('Response text:', responseText);
                throw new Error(
                    `Google Apps Script returned invalid JSON. Response: ${responseText.substring(
                        0,
                        200
                    )}`
                );
            }

            console.log(`Google Apps Script parsed result:`, result);

            // Return the same response structure as the original
            res.status(200).json(result);
        } catch (error) {
            console.error('Error in Google Apps Script proxy:', error);
            res.status(500).json({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
);

/* TESTING */
// export const handleCreatomateRequestHttp_TEST = onRequest(async (req, res) => {
//     console.log('creatomate request received');

//     const creatomateService = await CreatomateService.create(
//         process.env.CREATOMATE_API_KEY || ''
//     );

//     // const baseVideoViewUrl_square =
//     //     'https://drive.google.com/file/d/1_Ez_g2aPLE-PhLXAaXsL-g9y8wa4NX5D/view';

//     const baseViewUrl_vertical =
//         'https://drive.google.com/file/d/1_0ANVjkIFc80N0K3zPiKEcmToLbyJY3n/view';

//     const baseAdName = '103-R-AZ-AZ-AZ';

//     const fbAdId = '120227504353870364';
//     const result = await creatomateService.uploadToCreatomateWithHooksAll(
//         baseViewUrl_vertical,
//         baseAdName,
//         fbAdId
//     );
//     res.status(200).json({ success: true, result });
// });

// TEST FUNCTION: Iterate through all Ozempic (VerticalCodes.O) ad accounts and
// attempt to fetch the creative media URL for a fixed Facebook Ad ID until one succeeds.
// -------------------------------

export const testGetCreativeMediaUrlHttp = onRequest(
    { timeoutSeconds: 300 },
    async (req: Request, res: Response) => {
        // Extract ad_id from query parameters or request body
        const fbAdId = (req.query.ad_id as string) || req.body.ad_id;

        // Validate that ad_id is provided
        if (!fbAdId) {
            res.status(400).json({
                success: false,
                error: 'Missing required parameter: ad_id',
            });
            return;
        }

        console.log(
            `Testing creative media URL retrieval for Facebook Ad ID: ${fbAdId}`
        );

        const triedAccounts: Array<{
            accountId: string;
            success: boolean;
            mediaUrl?: string;
            error?: string;
        }> = [];

        try {
            for (const [accountId, config] of Object.entries(AD_ACCOUNT_DATA)) {
                if (config.type !== VerticalCodes.O) continue; // Only Ozempic accounts

                console.log(`Trying accountId: ${accountId}`);

                try {
                    const metaAdCreatorService = new MetaAdCreatorService({
                        appId: process.env.FACEBOOK_APP_ID || '',
                        appSecret: process.env.FACEBOOK_APP_SECRET || '',
                        accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
                        accountId,
                    });

                    console.log(
                        `Calling getCreativeMediaUrl for fbAdId: ${fbAdId} on account: ${accountId}`
                    );
                    const mediaUrl =
                        await metaAdCreatorService.getCreativeMediaUrl(fbAdId);
                    console.log(
                        `getCreativeMediaUrl result for account ${accountId}:`,
                        mediaUrl
                    );

                    if (mediaUrl) {
                        triedAccounts.push({
                            accountId,
                            success: true,
                            mediaUrl,
                        });

                        res.status(200).json({
                            success: true,
                            accountId,
                            fbAdId,
                            mediaUrl,
                            triedAccounts,
                        });
                        return;
                    }

                    // If no media URL returned, record as failure with explanation
                    triedAccounts.push({
                        accountId,
                        success: false,
                        error: 'getCreativeMediaUrl returned null/undefined - ad may not exist in this account or may not have media attached',
                    });
                } catch (innerError) {
                    console.error(
                        `Error fetching creative for accountId ${accountId}:`,
                        innerError
                    );

                    // Capture detailed error information
                    let errorDetails = '';
                    if (innerError instanceof Error) {
                        errorDetails = `${innerError.name}: ${innerError.message}`;
                        if (innerError.stack) {
                            errorDetails += `\nStack: ${innerError.stack}`;
                        }
                    } else {
                        errorDetails = String(innerError);
                    }

                    triedAccounts.push({
                        accountId,
                        success: false,
                        error: errorDetails,
                    });
                }
            }

            // If we reach here, no account returned a media URL
            res.status(404).json({
                success: false,
                message: 'Unable to retrieve media URL for any Ozempic account',
                fbAdId,
                triedAccounts,
                errorSummary: triedAccounts
                    .filter((acc) => !acc.success)
                    .map((acc) => ({
                        accountId: acc.accountId,
                        error: acc.error,
                    })),
            });
        } catch (error) {
            console.error(
                'Unexpected error in testGetCreativeMediaUrlHttp:',
                error
            );
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                triedAccounts,
            });
        }
    }
);

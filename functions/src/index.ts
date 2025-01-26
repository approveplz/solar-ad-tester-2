import { onRequest } from 'firebase-functions/v2/https';
import { Request, Response } from 'express';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { initializeApp, cert } from 'firebase-admin/app';
import invariant from 'tiny-invariant';
import serviceAccount from './solar-ad-tester-2-firebase-adminsdk-3iokc-bd8ce8732d.json' assert { type: 'json' };
import { config } from 'dotenv';
import MetaAdCreatorService from './services/MetaAdCreatorService.js';
import { ParsedFbAdInfo } from './models/ParsedFbAdInfo.js';
import { CreatedFbAdInfo } from './models/CreatedFbAdInfo.js';
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
    //@ts-ignore
    getFbAdSettingFirestore,
    saveFbAdFirestore,
    saveVideoHashFirestore,
    getVideoHashMapFirestore,
} from './firestoreCloud.js';
import {
    uploadVideoToStorage,
    getSignedUploadUrl,
    getSignedDownloadUrl,
} from './firebaseStorageCloud.js';
import { generateVideoHash } from './helpers.js';

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
        targeting: {
            geo_locations: {
                countries: ['US'],
                location_types: ['home', 'recent'],
                location_cluster_ids: [{ key: '9274085919322021' }],
            },
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
        targeting: {
            geo_locations: {
                countries: ['US'],
                location_types: ['home', 'recent'],
                location_cluster_ids: [{ key: '28950427651210969' }],
            },
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
                countries: ['US'],
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
    const adSetNameAndAdName = `${videoUuid}-AZ`;

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
    // console.log({ fbAdSettings });

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

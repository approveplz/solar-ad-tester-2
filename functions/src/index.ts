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
const IMAGE_BYTES_FIELD_NAME = 'image_bytes';

initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: 'solar-ad-tester-2.appspot.com',
});


const handleCreateAd = async (
    adType: string,
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
        fbAdSettings,
        adType
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
}

export interface GetSignedUploadUrlResponsePayload {
    uploadUrl: string;
    fileName: string;
}

export const uploadThirdPartyAdGetSignedUploadUrl = onRequest(
    { cors: false },
    async (req: Request, res: Response) => {
        const query: GetSignedUploadUrlRequestQuery = req.query;
        const { [AD_TYPE_FIELD_NAME]: adType, [UUID_FIELD_NAME]: videoUuid } =
            query;

        if (!videoUuid || !adType) {
            res.status(400).json({
                error: `Missing required parameters. Please provide fields: ${AD_TYPE_FIELD_NAME}, ${UUID_FIELD_NAME}`,
            });
            return;
        }

        try {
            const fileName = `AZ-${adType}-${videoUuid}.mp4`;
            const uploadUrl = await getSignedUploadUrl(
                adType,
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
    const WATCHED_FOLDERS = ['O'];

    const { name: filePath, contentType } = event.data;

    const [folder, fileName, ...rest] = filePath.split('/');

    if (!WATCHED_FOLDERS.includes(folder)) {
        return;
    }
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

    const adType = folder;

    const fbAdSettings = await getFbAdSettings(adType);
    console.log({ fbAdSettings });

    invariant(fbAdSettings !== null, `fbAdSettings is null`);

    const accountId =
        adType === 'O'
            ? process.env.FACEBOOK_ACCOUNT_ID_OZEMPIC
            : process.env.FACEBOOK_ACCOUNT_ID;

    const metaAdCreatorService = new MetaAdCreatorService({
        appId: process.env.FACEBOOK_APP_ID || '',
        appSecret: process.env.FACEBOOK_APP_SECRET || '',
        accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
        accountId: accountId || '',
        apiVersion: '20.0',
    });

    // /* Create Campaign */
    // const campaignName = `[facebook] - [GLP-1] - [AZ] - [USA] - [All] - [GLP-V1] - [Auto Creative Testing] - [1]`;
    // const campaign: Campaign = await metaAdCreatorService.createCampaign({
    //     name: campaignName,
    //     fbAdSettings,
    // });
    // const campaignId = campaign.id; // Campaign ID if we create it here

    const campaignId = process.env.FACEBOOK_OZEMPIC_CAMPAIGN_ID; // Read Campaign ID
    invariant(campaignId, 'empty ozempic campaign ID');

    const ad = await handleCreateAd(
        adType,
        metaAdCreatorService,
        fbAdSettings,
        campaignId,
        uuid,
        downloadUrl
    );
});

const getFbAdSettings = async (adType: string) => {
    let fbAdSettings: FbAdSettings | null = null;
    if (adType === 'S') {
        const campaignParams = {
            objective: 'OUTCOME_SALES',
            status: 'PAUSED',
        };

        const promotedObjectParams = {
            pixelId: '700671091822152',
            customEventType: 'LEAD',
            pageId: '117903068075583',
        };

        const adSetParams = {
            bidAmountCents: 2200,
            optimizationGoal: 'OFFSITE_CONVERSIONS',
            billingEvent: 'IMPRESSIONS',
            // dailyBudgetCents: '2000',
            lifetimeBudgetCents: '2000',
            bidStrategy: 'COST_CAP',
        };

        const ctaLinkValue =
            'https://www.greenenergycollective.org/s/no-cost-solar-v3';
        const videoMessage = `Homeowners, would you trade 30 seconds for $8,500?
    
    The recently revamped "2024 Solar Incentive Program" means you can now have solar panels installed at no cost on your roof, and make a major cut in your energy bills
    
    All you have to do is click the link below to find out if you qualify (takes 30 seconds or less)
    
    ${ctaLinkValue}`;

        const adCreativeParams = {
            videoTitle: 'Homeowners In Your Area Are Getting Paid to Go Solar',
            videoMessage,
            linkDescription: 'Less than 30 seconds to Qualify',
            ctaType: 'LEARN_MORE',
            ctaLinkValue,
        };

        fbAdSettings = {
            campaignParams,
            promotedObjectParams,
            adSetParams,
            adCreativeParams,
        };
    } else {
        // Ad type is O
        fbAdSettings = await getFbAdSettingFirestore(adType);
        if (fbAdSettings) {
            invariant(
                fbAdSettings.adSetParams.adSetTargeting,
                'adSetTargeting must exist'
            );
            const {
                age_max: ageMax,
                age_min: ageMin,
                genders,
            } = fbAdSettings.adSetParams.adSetTargeting;

            fbAdSettings.adSetParams.adSetTargeting = getAdSetTargeting(
                adType,
                ageMax,
                ageMin,
                genders
            );
        } else {
            throw new Error(`No ad settings found for adType: ${adType}`);
        }
    }

    return fbAdSettings;
};

const getAdSetTargeting = (
    adType: string,
    ageMax: number,
    ageMin: number,
    genders?: string[]
): FbApiAdSetTargeting => {
    let targeting: FbApiAdSetTargeting;

    if (adType === 'S') {
        throw new Error('Solar no longer supported');
    } else if (adType === 'O') {
        // adType === 'O'

        const excluded_geo_locations = {
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
        };

        const geo_locations = {
            countries: ['US'],
            location_types: ['home', 'recent'],
        };

        const targeting_relaxation_types = {
            lookalike: 0,
            custom_audience: 0,
        };

        targeting = {
            age_max: ageMax,
            age_min: ageMin,
            excluded_geo_locations,
            geo_locations,
            targeting_relaxation_types,
            genders,
        };
    } else {
        throw new Error(`Invalid adType: ${adType}`);
    }

    return targeting;
};

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

        const campaignId = process.env.FACEBOOK_OZEMPIC_CAMPAIGN_ID; // Read Campaign ID
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


/* No longer used. This was for solar */
export const createAdFromClickRequest = onRequest(
    {
        cors: true,
        timeoutSeconds: 60,
        memory: '512MiB',
    },
    async (req, res) => {
        const {
            adArchiveId,
            videoHdUrl,
            videoSdUrl,
            videoPreviewImageUrl,
            adTitle,
            adBody,
            ctaType,
            pageName,
            pageId,
            pageLikeCount,
            hasUserReported,
            startDateUnixSeconds,
            endDateUnixSeconds,
            publisherPlatform,
        } = req.body;

        const scrapedAd: ParsedFbAdInfo = {
            adArchiveId,
            videoHdUrl,
            videoSdUrl,
            videoPreviewImageUrl,
            adTitle,
            adBody,
            ctaType,
            pageName,
            pageId,
            pageLikeCount,
            hasUserReported,
            startDateUnixSeconds,
            endDateUnixSeconds,
            publisherPlatform,
        };

        const metaAdCreatorServiceSolar = new MetaAdCreatorService({
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
            accountId: process.env.FACEBOOK_ACCOUNT_ID || '',
            apiVersion: '20.0',
        });

        try {
            /* Generate hash of video */
            const scrapedVideoFileUrl =
                scrapedAd.videoHdUrl || scrapedAd.videoSdUrl;

            const videoHash = await generateVideoHash(scrapedVideoFileUrl, 1);
            const uploadedVideoHashHap = await getVideoHashMapFirestore(
                'SOLAR'
            );

            /* Check if we have already tested this video */
            if (videoHash in uploadedVideoHashHap) {
                const existingAdName = uploadedVideoHashHap[videoHash];
                console.log(
                    `This video has already been uploaded. Video hash: ${videoHash}. Existing ad name: ${existingAdName}`
                );
                res.status(500).send({ code: 'DUPLICATE' });
            }

            const campaignParams = {
                objective: 'OUTCOME_LEADS',
                status: 'PAUSED',
            };

            const promotedObjectParams = {
                pixelId: '700671091822152',
                customEventType: 'LEAD',
                pageId: '117903068075583',
            };

            const adSetParams = {
                bidAmountCents: 2200,
                optimizationGoal: 'OFFSITE_CONVERSIONS',
                billingEvent: 'IMPRESSIONS',
                dailyBudgetCents: '2000',
                lifetimeBudgetCents: '2000',
                bidStrategy: 'COST_CAP',
            };

            const ctaLinkValue =
                'https://www.greenenergycollective.org/s/no-cost-solar-v3';
            const videoMessage = `Homeowners, would you trade 30 seconds for $8,500?

The recently revamped "2024 Solar Incentive Program" means you can now have solar panels installed at no cost on your roof, and make a major cut in your energy bills

All you have to do is click the link below to find out if you qualify (takes 30 seconds or less)

${ctaLinkValue}`;

            const adCreativeParams = {
                videoTitle:
                    'Homeowners In Your Area Are Getting Paid to Go Solar',
                videoMessage,
                linkDescription: 'Less than 30 seconds to Qualify',
                ctaType: 'LEARN_MORE',
                ctaLinkValue,
            };

            const fbAdSettings: FbAdSettings = {
                campaignParams,
                promotedObjectParams,
                adSetParams,
                adCreativeParams,
            };

            // Create Campaign

            // const campaignName = `[facebook] - [Solar] - [AZ] - [MOM] - [ALL] - [SOLAR-SHS-V3] - APP - 1`;
            // const campaign: Campaign =
            //     await metaAdCreatorService.createCampaign({
            //         name: campaignName,
            //         fbAdSettings,
            //     });
            // const campaignId = campaign.id; // Campaign ID if we create it here

            const campaignId = '120210470839980108'; // Real Campaign ID
            // const campaignId = '120210773404130108'; // Test Campaign ID

            const adSetNameAndAdName = `AZ-S-${scrapedAd.adArchiveId}`;

            const adSet: AdSet | undefined =
                await metaAdCreatorServiceSolar.createAdSet({
                    name: adSetNameAndAdName,
                    campaignId,
                    fbAdSettings,
                });

            invariant(adSet, 'adSet must be defined');

            // Create Ad Video
            const adVideo: AdVideo =
                await metaAdCreatorServiceSolar.uploadAdVideo({
                    scrapedAdArchiveId: scrapedAd.adArchiveId,
                    videoFileUrl: scrapedVideoFileUrl,
                });

            const adCreative: AdCreative =
                await metaAdCreatorServiceSolar.createAdCreative(
                    `Creative-${adSetNameAndAdName}`,
                    adVideo,
                    scrapedAd.videoPreviewImageUrl,
                    fbAdSettings
                );

            const ad: Ad = await metaAdCreatorServiceSolar.createAd({
                name: adSetNameAndAdName,
                adSet,
                adCreative,
            });

            const { fileCloudStorageUri } = await uploadVideoToStorage(
                `${adSetNameAndAdName}.mp4`,
                scrapedVideoFileUrl
            );

            const createdFbAd: CreatedFbAdInfo = {
                campaignId,
                adSetId: adSet.id,
                adSetName: adSetNameAndAdName,
                creativeId: adCreative.id,
                adId: ad.id,
                videoId: adVideo.id,
                videoCloudStorageUri: fileCloudStorageUri,
                videoHash,
            };

            await saveFbAdFirestore('SOLAR', scrapedAd, createdFbAd);
            await saveVideoHashFirestore(
                'SOLAR',
                videoHash,
                adSetNameAndAdName
            );

            res.status(200).send({ code: 'CREATED' });
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }
    }
);


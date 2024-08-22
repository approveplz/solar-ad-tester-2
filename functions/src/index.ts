import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, cert } from 'firebase-admin/app';
import serviceAccount from './solar-ad-tester-2-firebase-adminsdk-3iokc-bd8ce8732d.json' assert { type: 'json' };
import { config } from 'dotenv';
import MetaAdCreatorService from './services/MetaAdCreatorService.js';
import { ParsedFbAdInfo } from './models/ParsedFbAdInfo.js';
import { CreatedFbAdInfo } from './models/CreatedFbAdInfo.js';
import {
    Ad,
    AdCreative,
    AdSet,
    AdVideo,
    //@ts-ignore
    Campaign,
} from 'facebook-nodejs-business-sdk';
import {
    //@ts-ignore
    getFbAdSettingFirestore,
    saveFbAdFirestore,
} from './firestoreCloud.js';
import { uploadVideoToStorage } from './firebaseStorageCloud.js';

config();

initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: 'solar-ad-tester-2.appspot.com',
});

const metaAdCreatorService = new MetaAdCreatorService({
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
    accountId: process.env.FACEBOOK_ACCOUNT_ID || '',
    apiVersion: '20.0',
});

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

        try {
            // const isDuplicate = await isAdDuplicate(scrapedAd);
            // if (isDuplicate) {
            //     res.status(200).send({ code: 'DUPLICATE' });
            //     return;
            // }

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

            const fbAdSettings = {
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

            const adSet: AdSet = await metaAdCreatorService.createAdSet({
                name: adSetNameAndAdName,
                campaignId,
                fbAdSettings,
            });

            const scrapedVideoFileUrl =
                scrapedAd.videoHdUrl || scrapedAd.videoSdUrl;

            // Create Ad Video
            const adVideo: AdVideo = await metaAdCreatorService.uploadAdVideo({
                scrapedAdArchiveId: scrapedAd.adArchiveId,
                videoFileUrl: scrapedVideoFileUrl,
            });

            const adCreative: AdCreative =
                await metaAdCreatorService.createAdCreative({
                    name: `Creative-${adSetNameAndAdName}`,
                    video: adVideo,
                    imageUrl: scrapedAd.videoPreviewImageUrl,
                    fbAdSettings,
                });

            const ad: Ad = await metaAdCreatorService.createAd({
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
                creativeId: adCreative.id,
                adId: ad.id,
                videoId: adVideo.id,
                videoCloudStorageUri: fileCloudStorageUri,
            };

            await saveFbAdFirestore('SOLAR', scrapedAd, createdFbAd);

            res.status(200).send({ code: 'CREATED' });
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }
    }
);

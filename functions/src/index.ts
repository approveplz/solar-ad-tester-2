import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { config } from 'dotenv';
import MetaAdCreatorService from './services/MetaAdCreatorService.js';
import { ParsedFbAdInfo } from './models/ParsedFbAdInfo';
// @ts-ignore
import { CreatedFbAdInfo } from './models/CreatedFbAdInfo';
import { Campaign } from 'facebook-nodejs-business-sdk';

config();

initializeApp();

const metaAdCreatorService = new MetaAdCreatorService({
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
    accountId: process.env.FACEBOOK_ACCOUNT_ID || '',
    apiVersion: '20.0',
});

export const createAdFromClick = onRequest(
    {
        cors: true,
        timeoutSeconds: 60,
        memory: '512MiB',
    },
    async (req, res) => {
        const {
            adArchiveId,
            adCreativeId,
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

        //@ts-ignore
        const scrapedAd: ParsedFbAdInfo = {
            adArchiveId,
            adCreativeId,
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

            const campaign: Campaign =
                await metaAdCreatorService.createCampaign({
                    name: `${adCreativeId}-Campaign-UI-Click`,
                });

            //@ts-ignore
            const {
                scrapedAdInfo,
                createdFbAdInfo,
            }: {
                scrapedAdInfo: ParsedFbAdInfo;
                createdFbAdInfo: CreatedFbAdInfo;
            } = await metaAdCreatorService.createVideoAdAndAddToCampaign({
                campaign,
                scrapedAd,
            });

            // await saveFbSolarAdFirestore({
            //     scrapedAdInfo,
            //     createdFbAdInfo,
            // });

            res.status(200).send({ code: 'CREATED' });
        } catch (error) {
            console.log(error);
            res.status(500).send(error);
        }
    }
);

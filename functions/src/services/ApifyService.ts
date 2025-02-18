import { ApifyClient } from 'apify-client';
import fs from 'fs';
import {
    saveScrapedAdFirestore,
    getScrapedAdsFirestoreAll,
    getScrapedAdFirestore,
} from '../firestoreCloud.js';
import { ScrapedAdDataFirestore } from '../models/ScrapedAdData.js';
import { GoogleGeminiService } from './GoogleGeminiService.js';
import invariant from 'tiny-invariant';
import { OpenAiService } from './OpenAiService.js';

export interface ScrapedAdItemSnapshotCard {
    title: string;
    video_hd_url: string;
    video_sd_url: string;
}

export interface ScrapedAdItem {
    ad_archive_id: string;
    ad_id: string | null;
    page_id: string;
    page_name: string;
    publisher_platform: string[];
    snapshot: {
        body: {
            text: string;
        };
        caption: string;
        cards: ScrapedAdItemSnapshotCard[] | [];
        page_id: string;
        page_like_count: number;
        page_name: string;
        videos: {
            video_hd_url: string;
            video_preview_image_url: string;
            video_sd_url: string;
            watermarked_video_hd_url: string;
            watermarked_video_sd_url: string;
        }[];
    };
    start_date: number;
    url: string;
    total: number;
}

export class ApifyService {
    private client: ApifyClient;
    private googleGeminiService: GoogleGeminiService;
    private openAiService: OpenAiService;
    constructor(
        token: string,
        googleGeminiService: GoogleGeminiService,
        openAiService: OpenAiService
    ) {
        this.client = new ApifyClient({
            token: token,
        });
        this.googleGeminiService = googleGeminiService;
        this.openAiService = openAiService;
    }

    getFbAdLibraryUrlForPageIdWithImpressionYesterday(pageId: string) {
        // Get yesterday's date
        const today = new Date();
        const yesterday = new Date(today.setDate(today.getDate() - 1));
        const year = yesterday.getFullYear();
        const month = (yesterday.getMonth() + 1).toString().padStart(2, '0');
        const day = yesterday.getDate().toString().padStart(2, '0');
        const startDateMin = `${year}-${month}-${day}`;

        return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&content_languages[0]=en&country=US&is_targeted_country=false&media_type=video&search_type=page&start_date[min]=${startDateMin}&start_date[max]&view_all_page_id=${pageId}`;
    }

    async testWithEmbeddings() {}

    async run() {
        console.log('Starting Apify Facebook Ads scraping...');
        const actorOptions = {
            count: 100,
            scrapeAdDetails: true,
            'scrapePageAds.activeStatus': 'all',
            period: '',
            urls: [
                // {
                //     url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&content_languages[0]=en&country=US&is_targeted_country=false&media_type=video&q=roof%20repair&search_type=page&start_date[min]=2025-01-09&start_date[max]&view_all_page_id=102217671595954',
                //     method: 'GET',
                // },
                {
                    url: this.getFbAdLibraryUrlForPageIdWithImpressionYesterday(
                        '209417582254766' // roofing quote.org
                    ),
                    method: 'GET',
                },
                // {
                //     url: this.getFbAdLibraryUrlForPageIdWithImpressionYesterday(
                //         '102217671595954' // cost guide
                //     ),
                //     method: 'GET',
                // },
            ],
        };

        const actorName = 'curious_coder/facebook-ads-library-scraper';
        console.log(`Starting actor: ${actorName}`);

        try {
            const run = await this.client.actor(actorName).call(actorOptions);

            console.log(`Actor ${actorName} fetching results from dataset...`);
            const { items: scrapedAdItems } = (await this.client
                .dataset(run.defaultDatasetId)
                .listItems()) as unknown as { items: ScrapedAdItem[] };

            console.log(
                `Actor ${actorName} retrieved ${scrapedAdItems.length} items from dataset`
            );

            const parsedActorResponse = this.parseActorResponse(scrapedAdItems);

            // await fs.promises.writeFile(
            //     './parsedActorResponse.json',
            //     JSON.stringify(parsedActorResponse, null, 2)
            // );

            // const parsedActorResponse: {
            //     [key: string]: {
            //         videoIdentifier: string;
            //         url: string;
            //         formattedStartTime: string;
            //         startTime: number;
            //         pageId: string;
            //         pageName: string;
            //         adArchiveId: string;
            //     };
            // } = JSON.parse(
            //     fs.readFileSync('./parsedActorResponse.json', 'utf8')
            // );

            let newAdsCount = 0;

            const scrapedAdDataFirestoreAll: ScrapedAdDataFirestore[] =
                await getScrapedAdsFirestoreAll();

            const duplicateVideoIdentifiers = new Set<string>();
            scrapedAdDataFirestoreAll.forEach((ad) => {
                duplicateVideoIdentifiers.add(ad.videoIdentifier);
                if (ad.duplicateVideoIdentifiers) {
                    ad.duplicateVideoIdentifiers.forEach((id) =>
                        duplicateVideoIdentifiers.add(id)
                    );
                }
            });

            console.log('Current video identifiers in database:');
            console.log([...duplicateVideoIdentifiers].join('\n'));

            for (const {
                formattedStartTime,
                startTime,
                pageName,
                pageId,
                adArchiveId,
                url,
                videoIdentifier,
            } of Object.values(parsedActorResponse)) {
                // const existingAd = await getScrapedAdFirestore(videoIdentifier);
                if (duplicateVideoIdentifiers.has(videoIdentifier)) {
                    console.log(
                        `Ad already exists or is a duplicate: ${videoIdentifier}. Skipping...`
                    );
                } else {
                    const {
                        isVideoDuplicate: isPotentialDuplicate,
                        duplicateVideoIdentifier:
                            potentialDuplicateVideoIdentifier,
                        duplicateVideoReasoning,
                        confidence,
                    } = await this.googleGeminiService.checkIfDuplicateVideoByDescriptions(
                        url
                    );

                    const logMessage =
                        `Current video : ${videoIdentifier}\n` +
                        `Potential duplicate flag from description: ${isPotentialDuplicate}\n` +
                        `Potential duplicate identifier: ${potentialDuplicateVideoIdentifier}\n` +
                        `Confidence: ${confidence}\n` +
                        `Reasoning: ${duplicateVideoReasoning}\n\n`;
                    console.log(logMessage);

                    await fs.promises.appendFile('duplicate.log', logMessage);

                    // First, check using description analysis. If it indicates a duplicate,
                    // then confirm with a direct video comparison.
                    if (
                        isPotentialDuplicate &&
                        potentialDuplicateVideoIdentifier
                    ) {
                        console.log(
                            `Comparing videos to confirm duplicate for ${videoIdentifier} (against ${potentialDuplicateVideoIdentifier})`
                        );

                        const duplicateScrapedAdFirestore: ScrapedAdDataFirestore | null =
                            await getScrapedAdFirestore(
                                potentialDuplicateVideoIdentifier
                            );
                        invariant(
                            duplicateScrapedAdFirestore,
                            `Duplicate scraped ad not found: ${potentialDuplicateVideoIdentifier}`
                        );

                        const duplicateVideoUrl =
                            duplicateScrapedAdFirestore.url;

                        const isConfirmedDuplicate =
                            await this.googleGeminiService.compareVideosToConfirmDuplicate(
                                url,
                                duplicateVideoUrl
                            );
                        if (isConfirmedDuplicate) {
                            console.log(
                                `${videoIdentifier} confirmed as duplicate of ${potentialDuplicateVideoIdentifier}`
                            );

                            // Update the duplicate record with the new identifier if needed.
                            const existingDuplicates =
                                duplicateScrapedAdFirestore.duplicateVideoIdentifiers ||
                                [];
                            if (!existingDuplicates.includes(videoIdentifier)) {
                                existingDuplicates.push(videoIdentifier);
                            }
                            duplicateScrapedAdFirestore.duplicateVideoIdentifiers =
                                existingDuplicates;

                            await saveScrapedAdFirestore(
                                potentialDuplicateVideoIdentifier,
                                duplicateScrapedAdFirestore
                            );
                        } else {
                            console.log(
                                `${videoIdentifier} was flagged as duplicate by description but did not confirm on comparison. Saving as a new ad.`
                            );

                            // Not a duplicate after confirmation so store it as a new ad.
                            const { textTranscript, description, hook } =
                                await this.googleGeminiService.getAdAnalysis(
                                    url
                                );

                            // console.log({
                            //     videoIdentifier,
                            //     textTranscript,
                            //     description,
                            //     hook,
                            // });

                            const scrapedAdDataFirestore: ScrapedAdDataFirestore =
                                {
                                    url,
                                    videoIdentifier,
                                    adArchiveId,
                                    formattedStartTime,
                                    startTimeUnixSeconds: startTime,
                                    isUsed: false,
                                    pageName,
                                    pageId,
                                    textTranscript,
                                    description,
                                    hook,
                                };

                            await saveScrapedAdFirestore(
                                videoIdentifier,
                                scrapedAdDataFirestore
                            );
                            console.log(`Saved ad: ${videoIdentifier}`);
                            newAdsCount += 1;
                        }
                    } else {
                        console.log(
                            `Video is not a duplicate based on descriptions: ${videoIdentifier}. Processing as new ad.`
                        );
                        const { textTranscript, description, hook } =
                            await this.googleGeminiService.getAdAnalysis(url);

                        console.log({
                            videoIdentifier,
                            textTranscript,
                            description,
                            hook,
                        });

                        const scrapedAdDataFirestore: ScrapedAdDataFirestore = {
                            url,
                            videoIdentifier,
                            adArchiveId,
                            formattedStartTime,
                            startTimeUnixSeconds: startTime,
                            isUsed: false,
                            pageName,
                            pageId,
                            textTranscript,
                            description,
                            hook,
                        };

                        await saveScrapedAdFirestore(
                            videoIdentifier,
                            scrapedAdDataFirestore
                        );
                        console.log(`Saved ad: ${videoIdentifier}`);
                        newAdsCount += 1;
                    }
                }
            }
            console.log(`Saved ${newAdsCount} new ads`);
        } catch (error) {
            console.error('Error during Apify run:', error);
            throw error;
        }
    }

    async run2() {
        // console.log('Starting Apify Facebook Ads scraping...');
        // const actorOptions = {
        //     count: 100,
        //     scrapeAdDetails: true,
        //     'scrapePageAds.activeStatus': 'all',
        //     period: '',
        //     urls: [
        //         // {
        //         //     url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&content_languages[0]=en&country=US&is_targeted_country=false&media_type=video&q=roof%20repair&search_type=page&start_date[min]=2025-01-09&start_date[max]&view_all_page_id=102217671595954',
        //         //     method: 'GET',
        //         // },
        //         {
        //             url: this.getFbAdLibraryUrlForPageIdWithImpressionYesterday(
        //                 '209417582254766' // roofing quote.org
        //             ),
        //             method: 'GET',
        //         },
        //         // {
        //         //     url: this.getFbAdLibraryUrlForPageIdWithImpressionYesterday(
        //         //         '102217671595954' // cost guide
        //         //     ),
        //         //     method: 'GET',
        //         // },
        //     ],
        // };

        // const actorName = 'curious_coder/facebook-ads-library-scraper';
        // console.log(`Starting actor: ${actorName}`);

        try {
            // const run = await this.client.actor(actorName).call(actorOptions);

            // console.log(`Actor ${actorName} fetching results from dataset...`);
            // const { items: scrapedAdItems } = (await this.client
            //     .dataset(run.defaultDatasetId)
            //     .listItems()) as unknown as { items: ScrapedAdItem[] };

            // console.log(
            //     `Actor ${actorName} retrieved ${scrapedAdItems.length} items from dataset`
            // );

            // const parsedActorResponse = this.parseActorResponse(scrapedAdItems);

            // await fs.promises.writeFile(
            //     './parsedActorResponse.json',
            //     JSON.stringify(parsedActorResponse, null, 2)
            // );

            const parsedActorResponse: {
                [key: string]: {
                    videoIdentifier: string;
                    url: string;
                    formattedStartTime: string;
                    startTime: number;
                    pageId: string;
                    pageName: string;
                    adArchiveId: string;
                };
            } = JSON.parse(
                fs.readFileSync('./parsedActorResponse.json', 'utf8')
            );

            let newAdsCount = 0;

            const scrapedAdDataFirestoreAll: ScrapedAdDataFirestore[] =
                await getScrapedAdsFirestoreAll();

            const duplicateVideoIdentifiers = new Set<string>();
            scrapedAdDataFirestoreAll.forEach((ad) => {
                duplicateVideoIdentifiers.add(ad.videoIdentifier);
                if (ad.duplicateVideoIdentifiers) {
                    ad.duplicateVideoIdentifiers.forEach((id) =>
                        duplicateVideoIdentifiers.add(id)
                    );
                }
            });

            console.log('Current video identifiers in database:');
            console.log([...duplicateVideoIdentifiers].join('\n'));

            for (const {
                formattedStartTime,
                startTime,
                pageName,
                pageId,
                adArchiveId,
                url,
                videoIdentifier,
            } of Object.values(parsedActorResponse)) {
                if (duplicateVideoIdentifiers.has(videoIdentifier)) {
                    console.log(
                        `Ad already exists or is a duplicate: ${videoIdentifier}. Skipping...`
                    );
                } else {
                    const { textTranscript, description, hook } =
                        await this.googleGeminiService.getAdAnalysis(url);

                    await this.openAiService.buildEmbeddingCache();
                    const {
                        bestScore,
                        videoIdentifier: potentialDuplicateVideoIdentifier,
                        newVector,
                    } = await this.openAiService.findMostSimilar(description);

                    console.log({
                        bestScore,
                        videoIdentifier: potentialDuplicateVideoIdentifier,
                    });

                    const isPotentialDuplicate = bestScore > 0.91;
                    // First, check using description analysis. If it indicates a duplicate,
                    // then confirm with a direct video comparison.
                    if (
                        isPotentialDuplicate &&
                        potentialDuplicateVideoIdentifier
                    ) {
                        console.log(
                            `Comparing videos to confirm duplicate for ${videoIdentifier} (against ${potentialDuplicateVideoIdentifier})`
                        );

                        const duplicateScrapedAdFirestore: ScrapedAdDataFirestore | null =
                            await getScrapedAdFirestore(
                                potentialDuplicateVideoIdentifier
                            );
                        invariant(
                            duplicateScrapedAdFirestore,
                            `Duplicate scraped ad not found: ${potentialDuplicateVideoIdentifier}`
                        );

                        const duplicateVideoUrl =
                            duplicateScrapedAdFirestore.url;

                        const isConfirmedDuplicate =
                            await this.googleGeminiService.compareVideosToConfirmDuplicate(
                                url,
                                duplicateVideoUrl
                            );
                        if (isConfirmedDuplicate) {
                            console.log(
                                `${videoIdentifier} confirmed as duplicate of ${potentialDuplicateVideoIdentifier}`
                            );

                            console.log(
                                `YES duplicate. score was ${bestScore}`
                            );

                            await fs.promises.appendFile(
                                'duplicate.log',
                                `YES duplicate. score was ${bestScore}
                                potentialDuplicateVideoIdentifier: ${potentialDuplicateVideoIdentifier}
                                videoIdentifier: ${videoIdentifier}\n\n`
                            );

                            // Update the duplicate record with the new identifier if needed.
                            const existingDuplicates =
                                duplicateScrapedAdFirestore.duplicateVideoIdentifiers ||
                                [];
                            if (!existingDuplicates.includes(videoIdentifier)) {
                                existingDuplicates.push(videoIdentifier);
                            }
                            duplicateScrapedAdFirestore.duplicateVideoIdentifiers =
                                existingDuplicates;

                            await saveScrapedAdFirestore(
                                potentialDuplicateVideoIdentifier,
                                duplicateScrapedAdFirestore
                            );
                        } else {
                            console.log(
                                `${videoIdentifier} was flagged as duplicate by description but did not confirm on comparison. Saving as a new ad.`
                            );

                            console.log(
                                `not duplicate. score was ${bestScore}. `
                            );
                            await fs.promises.appendFile(
                                'duplicate.log',
                                `NO duplicate. score was ${bestScore}
                                potentialDuplicateVideoIdentifier: ${potentialDuplicateVideoIdentifier}
                                videoIdentifier: ${videoIdentifier}
                                \n\n`
                            );
                            // Not a duplicate after confirmation so store it as a new ad.
                            const { textTranscript, description, hook } =
                                await this.googleGeminiService.getAdAnalysis(
                                    url
                                );

                            const scrapedAdDataFirestore: ScrapedAdDataFirestore =
                                {
                                    url,
                                    videoIdentifier,
                                    adArchiveId,
                                    formattedStartTime,
                                    startTimeUnixSeconds: startTime,
                                    isUsed: false,
                                    pageName,
                                    pageId,
                                    textTranscript,
                                    description,
                                    hook,
                                };

                            await saveScrapedAdFirestore(
                                videoIdentifier,
                                scrapedAdDataFirestore
                            );
                            console.log(`Saved ad: ${videoIdentifier}`);
                            newAdsCount += 1;
                        }
                    } else {
                        console.log(
                            `Video is not a duplicate based on descriptions: ${videoIdentifier}. Processing as new ad.`
                        );
                        const { textTranscript, description, hook } =
                            await this.googleGeminiService.getAdAnalysis(url);

                        console.log({
                            videoIdentifier,
                            textTranscript,
                            description,
                            hook,
                        });

                        const scrapedAdDataFirestore: ScrapedAdDataFirestore = {
                            url,
                            videoIdentifier,
                            adArchiveId,
                            formattedStartTime,
                            startTimeUnixSeconds: startTime,
                            isUsed: false,
                            pageName,
                            pageId,
                            textTranscript,
                            description,
                            hook,
                        };

                        await saveScrapedAdFirestore(
                            videoIdentifier,
                            scrapedAdDataFirestore
                        );
                        console.log(`Saved ad: ${videoIdentifier}`);
                        newAdsCount += 1;
                    }
                }
            }
            console.log(`Saved ${newAdsCount} new ads`);
        } catch (error) {
            console.error('Error during Apify run:', error);
            throw error;
        }
    }

    formatDate(timeUnixSeconds: number) {
        const date = new Date(timeUnixSeconds * 1000);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    getVideoIdentifier(url: string) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;

            const regex = /\/v\/[^\/]+\/([\d_]+)_n\./;
            const match = pathname.match(regex);
            return match ? match[1] : null;
        } catch (e) {
            console.error('Invalid URL:', url);
            return null;
        }
    }

    parseActorResponse(scrapedAdItems: ScrapedAdItem[]) {
        const result: {
            [key: string]: {
                videoIdentifier: string;
                url: string;
                formattedStartTime: string;
                startTime: number;
                pageId: string;
                pageName: string;
                adArchiveId: string;
            };
        } = {};

        scrapedAdItems.forEach((scrapedAdItem) => {
            const formattedStartTime = this.formatDate(
                scrapedAdItem.start_date
            );

            if (scrapedAdItem.snapshot.cards) {
                scrapedAdItem.snapshot.cards.forEach((card) => {
                    if (card.video_hd_url) {
                        const videoUrl = card.video_hd_url.trim();
                        const videoIdentifier =
                            this.getVideoIdentifier(videoUrl);
                        if (!videoIdentifier) {
                            console.warn(
                                'Unable to extract video identifier for url:',
                                videoUrl
                            );
                            return;
                        }
                        if (!result[videoIdentifier]) {
                            result[videoIdentifier] = {
                                videoIdentifier,
                                url: videoUrl,
                                formattedStartTime,
                                startTime: scrapedAdItem.start_date,
                                pageId: scrapedAdItem.page_id,
                                pageName: scrapedAdItem.page_name,
                                adArchiveId: scrapedAdItem.ad_archive_id,
                            };
                        } else {
                            if (
                                scrapedAdItem.start_date >
                                result[videoIdentifier].startTime
                            ) {
                                result[videoIdentifier].startTime =
                                    scrapedAdItem.start_date;
                                result[videoIdentifier].formattedStartTime =
                                    formattedStartTime;
                            }
                        }
                    }
                });
            }

            if (scrapedAdItem.snapshot.videos) {
                scrapedAdItem.snapshot.videos.forEach((video) => {
                    if (video.video_hd_url) {
                        const videoUrl = video.video_hd_url.trim();
                        const videoIdentifier =
                            this.getVideoIdentifier(videoUrl);
                        if (!videoIdentifier) {
                            console.warn(
                                'Unable to extract video identifier for url:',
                                videoUrl
                            );
                            return;
                        }
                        if (!result[videoIdentifier]) {
                            result[videoIdentifier] = {
                                videoIdentifier,
                                url: videoUrl,
                                formattedStartTime,
                                startTime: scrapedAdItem.start_date,
                                pageId: scrapedAdItem.page_id,
                                pageName: scrapedAdItem.page_name,
                                adArchiveId: scrapedAdItem.ad_archive_id,
                            };
                        } else {
                            if (
                                scrapedAdItem.start_date >
                                result[videoIdentifier].startTime
                            ) {
                                result[videoIdentifier].startTime =
                                    scrapedAdItem.start_date;
                                result[videoIdentifier].formattedStartTime =
                                    formattedStartTime;
                            }
                        }
                    }
                });
            }
        });

        return result;
    }
}

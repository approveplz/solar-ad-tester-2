import { ApifyClient } from 'apify-client';
import {
    getScrapedAdsFirestoreAll,
    savedScrapedAdFirestoreBatch,
} from '../firestoreCloud.js';
import { ScrapedAdDataFirestore } from '../models/ScrapedAdDataFirestore.js';
import { GoogleGeminiService } from './GoogleGeminiService.js';
import { OpenAiService } from './OpenAiService.js';
import { SkypeService } from './SkypeService.js';

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
    private skypeService: SkypeService;
    constructor(
        apiKey: string,
        googleGeminiService: GoogleGeminiService,
        openAiService: OpenAiService,
        skypeService: SkypeService
    ) {
        this.client = new ApifyClient({
            token: apiKey,
        });
        this.googleGeminiService = googleGeminiService;
        this.openAiService = openAiService;
        this.skypeService = skypeService;
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

    async execute() {
        console.log('Starting Apify Facebook Ads scraping...');
        const actorOptions = {
            count: 1000,
            scrapeAdDetails: true,
            'scrapePageAds.activeStatus': 'all',
            period: '',
            urls: [
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

        const run = await this.client.actor(actorName).call(actorOptions);

        console.log(`Actor ${actorName} fetching results from dataset...`);
        const { items: scrapedAdItems } = (await this.client
            .dataset(run.defaultDatasetId)
            .listItems()) as unknown as { items: ScrapedAdItem[] };

        console.log(
            `Actor ${actorName} retrieved ${scrapedAdItems.length} items from dataset`
        );

        const parsedActorResponse = this.parseActorResponse(scrapedAdItems);

        // import fs from 'fs';
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
        // } = JSON.parse(fs.readFileSync('./parsedActorResponse.json', 'utf8'));

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

        let skypMessageSent = false;
        let scrapedAdDataFirestoreToSave: ScrapedAdDataFirestore[] = [];

        const fiveDaysAgoTimestamp =
            Math.floor(Date.now() / 1000) - 5 * 24 * 60 * 60;

        for (const {
            formattedStartTime,
            startTime: startTimeUnixSeconds,
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
            } else if (startTimeUnixSeconds > fiveDaysAgoTimestamp) {
                console.log(
                    `Skipping ad ${videoIdentifier} because its startTime (${formattedStartTime}, UNIX seconds: ${startTimeUnixSeconds}) is within the last 5 days.`
                );
            } else {
                console.log(`Processing ad ${videoIdentifier}`);
                const { description } =
                    await this.googleGeminiService.getAdAnalysis(url);

                const descriptionEmbedding =
                    await this.openAiService.getEmbedding(description);

                const scrapedAdDataFirestore: ScrapedAdDataFirestore = {
                    url,
                    videoIdentifier,
                    adArchiveId,
                    formattedStartTime,
                    startTimeUnixSeconds,
                    isUsedForAd: false,
                    processed: false,
                    pageName,
                    pageId,
                    description,
                    descriptionEmbedding,
                    duplicateVideoIdentifiers: [],
                };

                scrapedAdDataFirestoreToSave.push(scrapedAdDataFirestore);

                if (scrapedAdDataFirestoreToSave.length >= 5) {
                    await savedScrapedAdFirestoreBatch(
                        scrapedAdDataFirestoreToSave
                    );
                    scrapedAdDataFirestoreToSave = [];
                    if (!skypMessageSent) {
                        skypMessageSent = true;
                        await this.skypeService.sendMessage(
                            'ALAN',
                            'There are new scraped ads ready for review at https://solar-ad-tester-2.web.app/'
                        );
                    }
                }
            }
        }

        if (scrapedAdDataFirestoreToSave.length > 0) {
            await savedScrapedAdFirestoreBatch(scrapedAdDataFirestoreToSave);
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

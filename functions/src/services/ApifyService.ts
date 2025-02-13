import { ApifyClient } from 'apify-client';
import fs from 'fs';
export class ApifyService {
    private client: ApifyClient;

    constructor(token: string) {
        this.client = new ApifyClient({
            token: token,
        });
    }

    async run() {
        console.log('Starting Apify Facebook Ads scraping...');
        const actorOptions = {
            count: 100,
            scrapeAdDetails: true,
            'scrapePageAds.activeStatus': 'all',
            period: '',
            urls: [
                {
                    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&content_languages[0]=en&country=US&is_targeted_country=false&media_type=video&q=roof%20repair&search_type=page&start_date[min]=2025-01-09&start_date[max]&view_all_page_id=102217671595954',
                    method: 'GET',
                },
            ],
        };

        console.log('Actor options:', JSON.stringify(actorOptions, null, 2));
        const actorName = 'curious_coder/facebook-ads-library-scraper';
        console.log(`Starting actor: ${actorName}`);

        try {
            const run = await this.client.actor(actorName).call(actorOptions);
            console.log('Actor run completed successfully');
            console.log('Run ID:', run.id);
            console.log('Status:', run.status);

            console.log('Fetching results from dataset...');
            const { items } = await this.client
                .dataset(run.defaultDatasetId)
                .listItems();

            console.log(`Retrieved ${items.length} items from dataset`);

            // Write items to JSON file

            const outputPath = './facebook-ads-data.json';
            fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));
            console.log(`Data saved to ${outputPath}`);
        } catch (error) {
            console.error('Error during Apify run:', error);
            throw error;
        }
    }
}

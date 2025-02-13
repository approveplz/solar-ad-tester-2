import fs from 'fs';

// Read and parse the JSON file (adjust path if necessary)
const rawData = fs.readFileSync('./facebook-ads-data.json', 'utf8');
const adsData = JSON.parse(rawData);

/**
 * Processes the ads data and returns an object keyed by each unique hd video URL.
 * For each unique hd video URL, the result object includes:
 * - hdvideourl: The hd video URL string.
 * - start_time: The latest start time (largest start_date) among ads that include that URL.
 * - times_appeared: The total number of times this URL appears across the entire dataset.
 *
 * @param {Array} ads - The array of ad objects from the JSON.
 * @returns {Object} An object mapping hd video URL to an object {hdvideourl, start_time, times_appeared}.
 */
function parseAds(ads) {
    const result = {};

    // Iterate over each ad in the dataset
    ads.forEach((ad) => {
        // Use the ad's start_date as its start time
        const adStartTime = ad.start_date;

        if (ad.snapshot) {
            // Helper function to process an array of video records (cards or videos)
            const processVideoArray = (videosArr) => {
                if (Array.isArray(videosArr)) {
                    videosArr.forEach((item) => {
                        if (
                            item.video_hd_url &&
                            typeof item.video_hd_url === 'string' &&
                            item.video_hd_url.trim() !== ''
                        ) {
                            const url = item.video_hd_url.trim();
                            // If we haven't seen this URL yet, initialize it;
                            // Otherwise, update the count and latest start time, if needed.
                            if (!result[url]) {
                                result[url] = {
                                    hdvideourl: url,
                                    start_time: adStartTime,
                                    times_appeared: 1,
                                };
                            } else {
                                result[url].times_appeared += 1;
                                // Update the start time if this ad's start_date is later
                                if (adStartTime > result[url].start_time) {
                                    result[url].start_time = adStartTime;
                                }
                            }
                        }
                    });
                }
            };

            // Process the 'cards' field
            processVideoArray(ad.snapshot.cards);
            // Process the 'videos' field
            processVideoArray(ad.snapshot.videos);
        }
    });

    return result;
}

const adVideos = parseAds(adsData);

fs.writeFileSync('ad_videos.json', JSON.stringify(adVideos, null, 2));
console.log(JSON.stringify(adVideos, null, 2));

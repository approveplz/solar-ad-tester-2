import { getFirestore } from 'firebase-admin/firestore';
import { FbAdSettings } from './models/FbAdSettings.js';
import { CreatedFbAdInfo } from './models/CreatedFbAdInfo.js';
import { ParsedFbAdInfo } from './models/ParsedFbAdInfo.js';

const FB_AD_SETTINGS_COLLECTION = 'fb-ad-settings';
const CREATED_ADS_COLLECTION_SOLAR = 'created-ads-collection-solar';
const CREATED_ADS_COLLECTION_ROOFING = 'created-ads-collection-roofing';
const CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES =
    'created-ads-collection-solar-videohashes';

const CREATED_ADS_COLLECTION_ROOFING_VIDEO_HASHES =
    'created-ads-collection-roofing-videohashes';

const CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES_DOC_NAME = 'videohashes';
const CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES_MAP_NAME = 'videohashes';

const FbAdSettingsDocConverter = {
    toFirestore: (data: FbAdSettings) => data,
    fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
        snap.data() as FbAdSettings,
};

export async function getFbAdSettingFirestore(
    adType: string
): Promise<FbAdSettings | null> {
    try {
        const db = getFirestore();
        const docSnap = await db
            .collection(FB_AD_SETTINGS_COLLECTION)
            .withConverter(FbAdSettingsDocConverter)
            .doc(adType)
            .get();

        return docSnap.data() || null;
    } catch (error) {
        console.error(
            `Error getting Doc: ${adType} from collection: ${FB_AD_SETTINGS_COLLECTION}`
        );
        console.error(error);
        return null;
    }
}

export async function saveVideoHashFirestore(
    adType: 'SOLAR' | 'ROOFING',
    videoHash: string,
    adSetName: string
) {
    console.log(
        `Saving ${adType} video hash to firestore. Video hash: ${videoHash}. Ad set name: ${adSetName}`
    );
    const db = getFirestore();
    const data = {
        videoHash: adSetName,
    };
    let collectionName = CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES;
    // if (adType === 'SOLAR') {
    //     collectionName = CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES;
    // } else if (adType === 'ROOFING') {
    //     collectionName = CREATED_ADS_COLLECTION_ROOFING_VIDEO_HASHES;
    // }

    return await db
        .collection(collectionName)
        .doc(CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES_DOC_NAME)
        .set(data, { merge: true });
}

export async function getVideoHashMapFirestore(adType: 'SOLAR' | 'ROOFING') {
    console.log(`Getting ${adType} video hash from firestore`);
    const db = getFirestore();

    let collectionName = CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES;

    const videoHashDocSnap = await db
        .collection(collectionName)
        .doc(CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES_DOC_NAME)
        .get();

    const params = videoHashDocSnap.data() || {};
    const videoHashMap =
        params[CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES_MAP_NAME];
    return videoHashMap;
}

export async function saveFbAdFirestore(
    adType: 'SOLAR' | 'ROOFING',
    scrapedFbAdInfo: ParsedFbAdInfo,
    createdFbAdInfo: CreatedFbAdInfo
) {
    console.log(
        `Saving ${adType} Ad Info to Firestore. Scraped Ad Archive ID: ${scrapedFbAdInfo.adArchiveId}`
    );
    const db = getFirestore();
    const data = {
        scrapedFbAdInfo,
        createdFbAdInfo,
    };

    let collectionName = CREATED_ADS_COLLECTION_SOLAR;
    if (adType === 'SOLAR') {
        collectionName = CREATED_ADS_COLLECTION_SOLAR;
    } else if (adType === 'ROOFING') {
        collectionName = CREATED_ADS_COLLECTION_ROOFING;
    }

    return await db
        .collection(collectionName)
        .doc(scrapedFbAdInfo.adArchiveId)
        .set(data);
}

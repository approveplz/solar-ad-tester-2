import { getFirestore } from 'firebase-admin/firestore';
import { FbAdSettings } from './models/FbAdSettings.js';
import { CreatedFbAdInfo } from './models/CreatedFbAdInfo.js';
import { ParsedFbAdInfo } from './models/ParsedFbAdInfo.js';
import { AdPerformance } from './models/AdPerformance.js';
const FB_AD_SETTINGS_COLLECTION = 'fb-ad-settings';
const CREATED_ADS_COLLECTION_SOLAR = 'created-ads-collection-solar';
const CREATED_ADS_COLLECTION_ROOFING = 'created-ads-collection-roofing';
const CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES =
    'created-ads-collection-solar-videohashes';

const CREATED_ADS_COLLECTION_ROOFING_VIDEO_HASHES =
    'created-ads-collection-roofing-videohashes';

const CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES_DOC_NAME = 'videohashes';
const CREATED_ADS_COLLECTION_SOLAR_VIDEO_HASHES_MAP_NAME = 'videohashes';

const INCREMENT_COUNTER_COLLECTION = 'counters';
const INCREMENT_COUNTER_DOC_NAME = 'global';

const AD_PERFORMANCE_COLLECTION = 'ad-performance';

const AdPerformanceDocConverter = {
    toFirestore: (data: AdPerformance) => data,
    fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
        snap.data() as AdPerformance,
};

export async function getAdPerformanceFirestoreById(
    fbAdId: string
): Promise<AdPerformance | null> {
    try {
        const db = getFirestore();
        const docSnap = await db
            .collection(AD_PERFORMANCE_COLLECTION)
            .withConverter(AdPerformanceDocConverter)
            .doc(fbAdId)
            .get();

        return docSnap.data() || null;
    } catch (error) {
        console.error(`Error getting ad performance for ID: ${fbAdId}`);
        console.error(error);
        return null;
    }
}

export async function getAdPerformanceFirestoreAll(): Promise<AdPerformance[]> {
    const db = getFirestore();
    const snapshot = await db
        .collection(AD_PERFORMANCE_COLLECTION)
        .withConverter(AdPerformanceDocConverter)
        .get();

    return snapshot.docs.map((doc) => doc.data());
}

export async function saveAdPerformanceFirestore(
    fbAdId: string,
    adPerformance: AdPerformance
) {
    const db = getFirestore();
    return await db
        .collection(AD_PERFORMANCE_COLLECTION)
        .doc(fbAdId)
        .set(adPerformance, { merge: true });
}

const FbAdSettingsDocConverter = {
    toFirestore: (data: FbAdSettings) => data,
    fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
        snap.data() as FbAdSettings,
};

export async function getIncrementedCounterFirestore(): Promise<number> {
    try {
        const db = getFirestore();
        const counterRef = db
            .collection(INCREMENT_COUNTER_COLLECTION)
            .doc(INCREMENT_COUNTER_DOC_NAME);

        return await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);

            const counterData = counterDoc.data();
            if (!counterData) {
                throw new Error('Counter document data is undefined');
            }

            const nextCounter = counterData.counter + 1;

            transaction.set(
                counterRef,
                { counter: nextCounter },
                { merge: true }
            );
            return nextCounter;
        });
    } catch (error) {
        console.error(
            'Error getting incremented counter from Firestore:',
            error
        );
        throw error;
    }
}

export async function getFbAdSettingFirestore(
    accountId: string
): Promise<FbAdSettings | null> {
    try {
        const db = getFirestore();
        const docSnap = await db
            .collection(FB_AD_SETTINGS_COLLECTION)
            .withConverter(FbAdSettingsDocConverter)
            .doc(accountId)
            .get();

        return docSnap.data() || null;
    } catch (error) {
        console.error(
            `Error getting Doc: ${accountId} from collection: ${FB_AD_SETTINGS_COLLECTION}`
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

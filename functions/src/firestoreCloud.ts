import { getFirestore } from 'firebase-admin/firestore';
import { FbAdSettings } from './models/FbAdSettings.js';
import { CreatedFbAdInfo } from './models/CreatedFbAdInfo.js';
import { ParsedFbAdInfo } from './models/ParsedFbAdInfo.js';
import { AdPerformance } from './models/AdPerformance.js';
import { ScrapedAdDataFirestore } from './models/ScrapedAdDataFirestore.js';
import { VerticalCodes } from './helpers.js';

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

export const AD_PERFORMANCE_COLLECTION = 'ad-performance';
export const TELEGRAM_SCRIPTS_COLLECTION = 'telegram-scripts';

const EVENTS_COLLECTION = 'events';

// Interface for the script data
export interface TelegramScriptData {
    idea: string;
    creator: string;
    vertical: VerticalCodes;
    notes: string;
    script: string;
}

/**
 * Saves script data to Firestore
 * @param scriptId The ID to use for the script
 * @param scriptData The script data to save
 */
export async function saveTelegramScriptDataFirestore(
    scriptId: string,
    scriptData: TelegramScriptData
): Promise<void> {
    const db = getFirestore();
    await db
        .collection(TELEGRAM_SCRIPTS_COLLECTION)
        .doc(scriptId)
        .set(scriptData);
}

/**
 * Gets script data by ID
 * @param scriptId The ID of the script
 * @returns The script data or null if not found
 */
export async function getTelegramScriptDataById(
    scriptId: string
): Promise<TelegramScriptData | null> {
    const db = getFirestore();
    const doc = await db
        .collection(TELEGRAM_SCRIPTS_COLLECTION)
        .doc(scriptId)
        .get();

    return doc.exists ? (doc.data() as TelegramScriptData) : null;
}

export async function deleteTelegramScriptDataById(scriptId: string) {
    const db = getFirestore();
    await db.collection(TELEGRAM_SCRIPTS_COLLECTION).doc(scriptId).delete();
}

export async function setEventFirestore(
    event: string,
    status: string,
    payload: any
) {
    const db = getFirestore();
    await db
        .collection(EVENTS_COLLECTION)
        .doc(event)
        .set({ status, payload }, { merge: true });
}

export async function getEventFirestoreDocRef(event: string) {
    const db = getFirestore();
    const docRef = await db.collection(EVENTS_COLLECTION).doc(event);
    return docRef;
}

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
    console.log(
        `Saving ad performance for fbAdId: ${fbAdId} name: ${adPerformance.adName}`
    );
    const db = getFirestore();
    return await db
        .collection(AD_PERFORMANCE_COLLECTION)
        .doc(fbAdId)
        .set(adPerformance, { merge: true });
}

export async function deleteAdPerformanceFirestore(docId: string) {
    console.log(`Deleting ad performance document with ID: ${docId}`);
    const db = getFirestore();
    return await db.collection(AD_PERFORMANCE_COLLECTION).doc(docId).delete();
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

const SCRAPED_ADS_COLLECTION = 'scraped-ads';

const ScrapedAdDataDocConverter = {
    toFirestore: (data: ScrapedAdDataFirestore) => data,
    fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
        snap.data() as ScrapedAdDataFirestore,
};

export async function saveScrapedAdFirestore(
    videoIdentifier: string,
    scrapedAdData: ScrapedAdDataFirestore
) {
    const db = getFirestore();
    await db
        .collection(SCRAPED_ADS_COLLECTION)
        .withConverter(ScrapedAdDataDocConverter)
        .doc(videoIdentifier)
        .set(scrapedAdData, { merge: true });
}

export async function savedScrapedAdFirestoreBatch(
    ads: ScrapedAdDataFirestore[]
): Promise<void> {
    if (ads.length === 0) {
        return;
    }

    const db = getFirestore();
    const adCollectionRef = db
        .collection(SCRAPED_ADS_COLLECTION)
        .withConverter(ScrapedAdDataDocConverter);

    let batch = db.batch();

    for (const ad of ads) {
        // Use the videoIdentifier as the document ID.
        const docRef = adCollectionRef.doc(ad.videoIdentifier);
        batch.set(docRef, ad, { merge: true });
    }

    await batch.commit();
}

export async function getScrapedAdFirestore(
    videoIdentifier: string
): Promise<ScrapedAdDataFirestore | null> {
    const db = getFirestore();
    const docRef = await db
        .collection(SCRAPED_ADS_COLLECTION)
        .withConverter(ScrapedAdDataDocConverter)
        .doc(videoIdentifier)
        .get();
    return docRef.data() || null;
}

export async function getScrapedAdsFirestoreAll(): Promise<
    ScrapedAdDataFirestore[]
> {
    const db = getFirestore();
    const snapshot = await db
        .collection(SCRAPED_ADS_COLLECTION)
        .withConverter(ScrapedAdDataDocConverter)
        .get();
    return snapshot.docs.map((doc) => doc.data());
}

/*
Not Currently being used
*/

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

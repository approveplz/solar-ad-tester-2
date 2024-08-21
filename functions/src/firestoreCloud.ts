import { getFirestore } from 'firebase-admin/firestore';
// import { FbAdSettingsSchema } from './models/FbAdSettingsSchema';
import { CreatedFbAdInfo } from './models/CreatedFbAdInfo';
import { ParsedFbAdInfo } from './models/ParsedFbAdInfo';

const FB_AD_SETTINGS_COLLECTION = 'fb-ad-settings';
const CREATED_ADS_COLLECTION_SOLAR = 'created-ads-collection-solar';
//@ts-ignore
const CREATED_ADS_COLLECTION_ROOFING = 'created-ads-collection-roofing';

// const FbAdSettingsDocConverter = {
//     toFirestore: (data: FbAdSettingsSchema) => data,
//     fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) =>
//         snap.data() as FbAdSettingsSchema,
// };

export async function getFbAdSettingFirestore(uuid: string) {
    let params;
    try {
        const db = getFirestore();
        const docSnap = await db
            .collection(FB_AD_SETTINGS_COLLECTION)
            // .withConverter(FbAdSettingsDocConverter)
            .doc(uuid)
            .get();

        params = docSnap.data();
    } catch (error) {
        console.error(
            `Error getting Doc: ${uuid} from collection: ${FB_AD_SETTINGS_COLLECTION}`
        );
        console.error(error);
    } finally {
        return params;
    }
}

export async function saveFbAdFirestore(
    adType: 'SOLAR' | 'ROOFING',
    scrapedFbAdInfo: ParsedFbAdInfo,
    createdFbAdInfo: CreatedFbAdInfo
) {
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
        .doc(createdFbAdInfo.adId)
        .set(data);
}

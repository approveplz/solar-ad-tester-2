// Need to import like this because we dont want to (or cant) use node modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
    getFirestore,
    setDoc,
    getDoc,
    doc,
    collection,
    getDocs,
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyBVYUMAWQQcJjsNJJuPhfESlyUvjdQVaJA',
    authDomain: 'solar-ad-tester-2.firebaseapp.com',
    projectId: 'solar-ad-tester-2',
    storageBucket: 'solar-ad-tester-2.appspot.com',
    messagingSenderId: '834815684743',
    appId: '1:834815684743:web:c1381ec79e4e66c3274822',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

// This should be the same as constants used to access collection from cloud functions
// Cant share code between client and cloud functions. Too lazy to setup a symbolic link
const FB_AD_SETTINGS_COLLECTION = 'fb-ad-settings';
const AD_PERFORMANCE_COLLECTION = 'ad-performance';
export async function saveFbAdSettings(accountId, fbAdSettings) {
    try {
        const docRef = doc(db, FB_AD_SETTINGS_COLLECTION, accountId);
        await setDoc(docRef, fbAdSettings);
        console.log(
            `Document written with ID: ${docRef.id}. Data:`,
            fbAdSettings
        );
    } catch (error) {
        console.error(`Error adding document: ${error}`);
        throw error;
    }
}

export async function getFbAdSettings(accountId) {
    const docRef = doc(db, FB_AD_SETTINGS_COLLECTION, accountId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return docSnap.data();
    } else {
        console.log(`No data exists for accountId: ${accountId}`);
        return null;
    }
}

export async function getAdPerformanceFirestoreAll() {
    const collectionRef = collection(db, AD_PERFORMANCE_COLLECTION);
    const snapshot = await getDocs(collectionRef);
    return snapshot.docs.map((doc) => doc.data());
}

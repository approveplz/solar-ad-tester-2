function main() {
    // https://drive.google.com/drive/u/2/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22
    const INGESTION_FOLDER_ID = '1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22';
    const ARCHIVE_FOLDER_ID = '1cwlvPlszQK62kT4b2EfZaIFkfryC4SSR';
    const FIREBASE_FUNCTION_URL =
        'https://us-central1-solar-ad-tester-2.cloudfunctions.net/createFbAdHttp';
    const PROCESSED_FILE_IDS_KEY = 'processedFileIds';
    const ROOFING_CC2_NEW_ACCOUNT_ID = '358423827304360'; // Roofing, Vincent x Digitsolution CC 2 New
    const OZEMPIC_ACCOUNT_ID = '916987259877684';

    const properties = PropertiesService.getScriptProperties();
    const processedFileIds = JSON.parse(
        properties.getProperty(PROCESSED_FILE_IDS_KEY) || '[]'
    );

    const verticalToAccountId = {
        R: ROOFING_CC2_NEW_ACCOUNT_ID,
        O: OZEMPIC_ACCOUNT_ID,
    };

    const sourceFolder = DriveApp.getFolderById(INGESTION_FOLDER_ID);
    const archiveFolder = DriveApp.getFolderById(ARCHIVE_FOLDER_ID);
    const files = sourceFolder.getFiles();

    while (files.hasNext()) {
        const file = files.next();
        const fileId = file.getId();
        const fileName = file.getName();
        const mimeType = file.getMimeType();

        if (mimeType !== 'video/mp4') {
            console.log(
                `Skipping non-video fileName: ${fileName} (${mimeType})`
            );
            continue;
        }

        if (processedFileIds.includes(fileId)) {
            console.log(`Skipping already processed file: ${fileId}`);
            continue;
        }

        const { vertical, scriptWriter, ideaWriter, hookWriter } =
            processFileName(fileName);

        const accountId = verticalToAccountId[vertical];

        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

        const response = UrlFetchApp.fetch(FIREBASE_FUNCTION_URL, {
            method: 'POST',
            contentType: 'application/json',
            payload: JSON.stringify({
                accountId,
                downloadUrl,
                vertical,
                scriptWriter,
                ideaWriter,
                hookWriter,
            }),
        });

        const status = response.getResponseCode();

        if (status === 200) {
            const responseData = JSON.parse(response.getContentText());
            const updatedAdName = responseData.adPerformance.adName;
            file.setName(updatedAdName);
            file.moveTo(archiveFolder);
            processedFileIds.push(fileId);
        }
    }

    properties.setProperty(
        PROCESSED_FILE_IDS_KEY,
        JSON.stringify(processedFileIds)
    );
}

function processFileName(fileName) {
    const fileParts = fileName.split('-');
    const [vertical, scriptWriter, ideaWriter, hookWriter] = fileParts;
    return {
        vertical,
        scriptWriter,
        ideaWriter,
        hookWriter,
    };
}

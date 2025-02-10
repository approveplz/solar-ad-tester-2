// https://script.google.com/home/projects/1gV5I0pJcXZ94D2KkyxHEbVkKW6U6ABljHW7Uvy8tNac6MJ0IV5mRVKUX/edit
function main() {
    // https://drive.google.com/drive/u/2/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22
    const INGESTION_FOLDER_ID = '1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22';
    const ARCHIVE_FOLDER_ID = '1cwlvPlszQK62kT4b2EfZaIFkfryC4SSR';
    const FIREBASE_FUNCTION_URL =
        'https://us-central1-solar-ad-tester-2.cloudfunctions.net/createFbAdHttp';
    const PROCESSED_FILE_IDS_KEY = 'processedFileIds';
    const ROOFING_CC1_ACCOUNT_ID = '467161346185440';

    const properties = PropertiesService.getScriptProperties();
    const processedFileIds = JSON.parse(
        properties.getProperty(PROCESSED_FILE_IDS_KEY) || '[]'
    );

    const accountId = ROOFING_CC1_ACCOUNT_ID;
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
        file.setSharing(
            DriveApp.Access.ANYONE_WITH_LINK,
            DriveApp.Permission.VIEW
        );

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

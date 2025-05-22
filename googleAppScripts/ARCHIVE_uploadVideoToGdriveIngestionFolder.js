const INGESTION_FOLDER_ID = '1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22';

// This must be called doGet to handle GET requests
function doGet(e) {
    try {
        const fileUrl = e.parameter.fileUrl;
        const videoIdentifier = e.parameter.videoIdentifier;
        const fileName = `R-AZ-AZ-AZ-${videoIdentifier}.mp4`;
        const response = UrlFetchApp.fetch(fileUrl);
        const blob = response.getBlob().setName(fileName);

        const folder = DriveApp.getFolderById(INGESTION_FOLDER_ID);
        const file = folder.createFile(blob);

        const result = {
            status: 'success',
            fileId: file.getId(),
        };

        return ContentService.createTextOutput(
            JSON.stringify(result)
        ).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        const result = {
            status: 'error',
            message: error.toString(),
        };
        return ContentService.createTextOutput(
            JSON.stringify(result)
        ).setMimeType(ContentService.MimeType.JSON);
    }
}

// Web App URL
// https://script.google.com/macros/s/AKfycbxcnLWBkRRxrnWNMyO9Si2EhWW2HFQQTrLuBmYtOMCLApCUJH0qVLf5Huj4kY8_xxF4/exec

const ARCHIVE_FOLDER_ID = '1cwlvPlszQK62kT4b2EfZaIFkfryC4SSR';

// This must be called doGet to handle GET requests
function doGet(e) {
    try {
        const fileUrl = e.parameter.fileUrl;
        const adName = e.parameter.adName;

        const archiveFolder = DriveApp.getFolderById(ARCHIVE_FOLDER_ID);

        const match = fileUrl.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]{25,})/);
        const fileId = match[1];

        const file = DriveApp.getFileById(fileId);

        file.setName(adName);
        file.moveTo(archiveFolder);

        const result = {
            status: 'success',
            archivedUrl: file.getUrl(),
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

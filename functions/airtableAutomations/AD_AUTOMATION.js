let firebaseUrl = 'https://createfbadhttp-txyabkufvq-uc.a.run.app';

// Get the triggering record
let inputConfig = input.config();
let recordId = inputConfig.recordId;

// Fetch the record details
let table = base.getTable('AD_AUTOMATION');
let record = await table.selectRecordAsync(recordId);

// Prepare data to send to the webhook
let data;
if (!record) {
    data = {};
} else {
    data = {
        mediaBuyer: record.getCellValueAsString('MEDIA_BUYER'),
        ideaWriter: record.getCellValueAsString('IDEA_WRITER'),
        vertical: record.getCellValueAsString('VERTICAL'),
        scriptWriter: record.getCellValueAsString('SCRIPT_WRITER'),
        hookWriter: record.getCellValueAsString('HOOK_WRITER'),
        adName: record.getCellValueAsString('AD_NAME'),
        scriptId: record.getCellValueAsString('SCRIPT_ID'),
        downloadUrl: record.getCellValueAsString('DOWNLOAD_URL'),
        mediaType: record.getCellValueAsString('MEDIA_TYPE'),
    };
}

// Create the fb ad
let response = await fetch(firebaseUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
});

// Move file to archive
// Move the file to archive via Google Apps Script
let appsScriptUrl =
    'https://script.google.com/macros/s/AKfycbxcnLWBkRRxrnWNMyO9Si2EhWW2HFQQTrLuBmYtOMCLApCUJH0qVLf5Huj4kY8_xxF4/exec';

if (record) {
    let fileUrl = record.getCellValueAsString('DOWNLOAD_URL');
    let adName = record.getCellValueAsString('AD_NAME');

    let moveFileUrl = `${appsScriptUrl}?fileUrl=${encodeURIComponent(
        fileUrl
    )}&adName=${encodeURIComponent(adName)}`;

    let archiveResponse = await fetch(moveFileUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
        },
    });
    let archiveResult = await archiveResponse.json();

    if (archiveResult.status !== 'success') {
        console.warn('Archiving failed:', archiveResult.message);
    } else {
        console.log('File moved to archive successfully');
        const downloadUrlFieldId = 'flddowoJxAIsy0D88';
        await table.updateRecordAsync(recordId, {
            [downloadUrlFieldId]: archiveResult.archiveUrl,
        });
    }
}

let firebaseUrl = 'https://createfbadhttp-txyabkufvq-uc.a.run.app';

// Get the triggering record
let inputConfig = input.config();
let recordId = inputConfig.recordId;

// Fetch the record details
let table = base.getTable('AD_AUTOMATION');
let record = await table.selectRecordAsync(recordId);

const airtableStatus = record.getCellValueAsString('STATUS');

const STATUS = {
    AUTOUPLOAD: 'AUTOUPLOAD',
    MANUAL: 'MANUAL',
};

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

if (airtableStatus === STATUS.AUTOUPLOAD) {
    // Create FB ad first
    let response = await fetch(firebaseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    // Only move file if FB ad creation was successful
    if (response.ok) {
        await moveFileToArchive(record, recordId, table);
    } else {
        console.error('FB ad creation failed, skipping file archive');
    }
} else if (airtableStatus === STATUS.MANUAL) {
    // For manual status, always move the file
    await moveFileToArchive(record, recordId, table);
}

// Function to move file to archive
async function moveFileToArchive(record, recordId, table) {
    let appsScriptUrl =
        'https://script.google.com/macros/s/AKfycbxcnLWBkRRxrnWNMyO9Si2EhWW2HFQQTrLuBmYtOMCLApCUJH0qVLf5Huj4kY8_xxF4/exec';

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
        console.error('Archiving failed:', archiveResult.message);
        return false;
    } else {
        console.log('File moved to archive successfully');
        const downloadUrlFieldId = 'flddowoJxAIsy0D88';
        await table.updateRecordAsync(recordId, {
            [downloadUrlFieldId]: archiveResult.archiveUrl,
        });
        return true;
    }
}

let firebaseUrl = 'https://createfbadhttp-txyabkufvq-uc.a.run.app';

// Get the triggering record
let inputConfig = input.config();
let recordId = inputConfig.recordId;

// Fetch the record details
let table = base.getTable('AD_AUTOMATION');
let record = await table.selectRecordAsync(recordId);

if (!record) {
    throw new Error(`Record ${recordId} not found`);
}

const STATUS = {
    AUTOUPLOAD: 'AUTOUPLOAD',
    MANUAL: 'MANUAL',
};

// Define required fields
const REQUIRED_FIELDS = [
    'MEDIA_BUYER',
    'IDEA_WRITER',
    'VERTICAL',
    'SCRIPT_WRITER',
    'HOOK_WRITER',
    'AD_NAME',
    'DOWNLOAD_URL',
    'MEDIA_TYPE',
    'STATUS',
];

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
        airtableRecordId: recordId,
        automationType: record.getCellValueAsString('STATUS'),
    };

    // Validate required fields
    const missingFields = [];
    for (const fieldName of REQUIRED_FIELDS) {
        const value = record.getCellValueAsString(fieldName);
        if (!value || value.trim() === '') {
            missingFields.push(fieldName);
        }
    }

    if (missingFields.length > 0) {
        throw new Error(
            `Missing required data in record ${recordId}. Empty fields: ${missingFields.join(
                ', '
            )}`
        );
    }
}

fetch(firebaseUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
});

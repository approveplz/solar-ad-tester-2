import fetch from 'node-fetch';
import stream, { Readable } from 'stream';
import { getStorage } from 'firebase-admin/storage';

// export const OZEMPIC_THUMBNAIL_IMG_FILEPATH = 'O/O-thumbnail.jpeg';

export const GOOGLE_CLOUD_STORAGE_CUSTOM_METADATA_HEADER_UUID =
    'x-goog-meta-uuid'; // Must start with x-goog-meta-

export async function uploadVideoToStorage(
    destFileName: string, // Must include filetype, ex: .mp4
    uploadFileUri: string
) {
    console.log(
        `Uploading video to cloud storage. Destination file name: ${destFileName}`
    );
    const bucket = getStorage().bucket();

    try {
        const response = await fetch(uploadFileUri);

        if (!response.ok) {
            throw new Error(`HTTP error. status: ${response.status}`);
        }

        const file = bucket.file(destFileName);
        const passthroughStream = new stream.PassThrough();

        response.body?.pipe(passthroughStream);

        await new Promise((resolve, reject) => {
            passthroughStream
                .pipe(
                    file.createWriteStream({
                        metadata: {
                            contentType: 'video/mp4',
                        },
                    })
                )
                .on('finish', resolve)
                .on('error', reject);
        });

        console.log(`File: ${uploadFileUri} uploaded as ${destFileName}`);
    } catch (error) {
        console.error(
            `Error uploading file: ${uploadFileUri} as ${destFileName}`,
            error
        );
        throw error;
    }

    const fileCloudStorageUri = `gs://solar-ad-tester-2.appspot.com/${destFileName}`;

    return { fileCloudStorageUri, uploadFileUri };
}

const EXPIRE_TIME_MS = Date.now() + 2 * 60 * 60 * 1000; // 2 hours

export async function getSignedUploadUrl(
    accountId: string,
    fileName: string,
    uuid: string
): Promise<string> {
    const bucket = getStorage().bucket();

    const [url] = await bucket.file(`${accountId}/${fileName}`).getSignedUrl({
        action: 'write',
        expires: EXPIRE_TIME_MS,
        contentType: 'video/mp4',
        extensionHeaders: {
            [GOOGLE_CLOUD_STORAGE_CUSTOM_METADATA_HEADER_UUID]: uuid,
        },
    });

    return url;
}

export async function getSignedDownloadUrl(filePath: string) {
    const bucket = getStorage().bucket();
    const file = bucket.file(filePath);

    const [metadata] = await file.getMetadata();
    const uuid = metadata?.metadata?.['uuid'];

    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: EXPIRE_TIME_MS,
    });

    console.log({ url, uuid });
    return { url, uuid };
}

export async function getAllFilesInFolderWithSignedUrls(folderName: string) {
    const bucket = getStorage().bucket();

    try {
        const [files] = await bucket.getFiles({
            prefix: folderName,
        });

        const filePromises = files
            .filter(
                // Only return files in the folder. Not folder itself, or nested folders
                (file) => file.name !== folderName && !file.name.endsWith('/')
            )
            .map(async (file) => {
                const [url] = await file.getSignedUrl({
                    action: 'read',
                    expires: EXPIRE_TIME_MS,
                });
                return {
                    // Remove the folder name from the file name
                    name: file.name.replace(`${folderName}/`, ''),
                    url,
                };
            });

        return Promise.all(filePromises);
    } catch (error) {
        console.error(
            `Error listing files in folder: ${bucket.name}/${folderName}`,
            error
        );
        throw error;
    }
}

export async function uploadCsvToStorage(
    fileName: string,
    csvStream: Readable
): Promise<{ fileCloudStorageUri: string }> {
    const folder = 'roofing-zips'; //
    const destFileName = `${folder}/${fileName}`;
    const bucket = getStorage().bucket();
    const file = bucket.file(destFileName);

    try {
        await new Promise((resolve, reject) => {
            csvStream
                .pipe(
                    file.createWriteStream({
                        metadata: {
                            contentType: 'text/csv',
                        },
                    })
                )
                .on('finish', resolve)
                .on('error', reject);
        });
        console.log(`CSV file uploaded successfully as ${destFileName}`);
    } catch (error) {
        console.error(`Error uploading CSV file as ${destFileName}`, error);
        throw error;
    }

    const fileCloudStorageUri = `gs://${bucket.name}/${destFileName}`;
    return { fileCloudStorageUri };
}

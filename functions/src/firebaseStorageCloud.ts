import fetch from 'node-fetch';
import stream from 'stream';
import { getStorage } from 'firebase-admin/storage';

export async function uploadVideoToStorage(
    destFileName: string,
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

    return { destFileName, uploadFileUri };
}

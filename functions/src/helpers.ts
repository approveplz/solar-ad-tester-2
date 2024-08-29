import ffmpeg from 'fluent-ffmpeg';
import ffmpegPathImport from 'ffmpeg-static';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { Readable, PassThrough } from 'stream';

const ffmpegPath = ffmpegPathImport as unknown as string;

ffmpeg.setFfmpegPath(ffmpegPath);

export async function generateVideoHash(
    videoUrl: string,
    sampleIntervalSeconds: number = 1
) {
    const response = await fetch(videoUrl);
    if (!response.ok) {
        throw new Error();
    }
    if (!response.body) {
        throw new Error();
    }

    const readableStream = Readable.from(response.body);

    return new Promise<string>((resolve, reject) => {
        const combinedHash = crypto.createHash('sha256');
        let frameCount = 0;
        const outputStream = new PassThrough();

        ffmpeg(readableStream)
            .videoFilter(`fps=1/${sampleIntervalSeconds}`) // Outputs one frame every sampleIntervalSeconds
            .outputOptions(['-f', 'rawvideo', '-pix_fmt', 'rgb24']) // Outputs to raw video and sets pixel format to rgb24, which is common
            .on('error', (error) => {
                console.error('ffmpeg processing error', error);
                reject(error);
            })
            .on('end', () => {
                console.log(`ffmpeg processing finished`);
                const finalHash = combinedHash.digest('hex');
                resolve(finalHash);
            })
            .pipe(outputStream);

        outputStream
            .on('data', (chunk) => {
                const frameHash = crypto
                    .createHash('md5')
                    .update(chunk)
                    .digest('hex');

                console.log({ frameHash });
                combinedHash.update(frameHash);
                frameCount++;
                console.log(`Processed frame ${frameCount}`);
            })
            .on('error', (error) => {
                console.error(`Output stream error`, error);
            });
    });
}

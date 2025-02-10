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
        throw new Error(
            `HTTP error: ${response.status} ${response.statusText}`
        );
    }
    if (!response.body) {
        throw new Error('Network error: Response body is null');
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
                reject(error);
            });

        readableStream.on('error', (error) => {
            console.error(`Imput stream error`, error);
            reject(error);
        });
    });
}

export function getAdName(
    counter: number,
    vertical: string,
    scriptWriter: string,
    ideaWriter: string,
    hookWriter: string
): string {
    return `${counter}-${vertical}-${scriptWriter}-${ideaWriter}-${hookWriter}`;
}

export function getNextWeekdayUnixSeconds(now: Date = new Date()): number {
    // Calculate days to add to get to next weekday
    const daysToAdd =
        now.getUTCDay() === 5
            ? 3 // If Friday, add 3 days
            : now.getUTCDay() === 6
            ? 2 // If Saturday, add 2 days
            : now.getUTCDay() === 0
            ? 1 // If Sunday, add 1 day
            : 1; // If Mon-Thu, add 1 day

    const nextWeekday = new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + daysToAdd,
            14, // 7 AM PDT (14:00 UTC)
            0,
            0,
            0
        )
    );

    return Math.floor(nextWeekday.getTime() / 1000);
}

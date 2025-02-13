import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPathImport from 'ffmpeg-static';
import { PassThrough } from 'stream';

const ffmpegPath = ffmpegPathImport as unknown as string;

ffmpeg.setFfmpegPath(ffmpegPath);

export class GoogleGeminiService {
    private generativeAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        this.generativeAI = new GoogleGenerativeAI(apiKey);
    }

    // Downscale a video from a URL without saving to disk.
    private async downscaleVideo(videoUrl: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let finished = false; // Prevent multiple resolutions.
            const outputStream = new PassThrough(); // Stream to capture FFmpeg output.
            const chunks: Buffer[] = []; // Buffer to store data chunks.

            outputStream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            outputStream.on('end', () => {
                if (!finished) {
                    finished = true;
                    resolve(Buffer.concat(chunks).toString('base64'));
                }
            });

            outputStream.on('close', () => {
                if (!finished) {
                    finished = true;
                    resolve(Buffer.concat(chunks).toString('base64'));
                }
            });

            ffmpeg(videoUrl) // Start processing the video from the URL.
                .videoFilters('scale=iw/2:ih/2') // Scale both width and height to half.
                .outputOptions([
                    '-c:v libx264', // Use the H.264 codec.
                    '-preset ultrafast', // Use the ultrafast preset.
                    '-crf 28', // Use a higher CRF for a smaller file size.
                    '-movflags frag_keyframe+empty_moov', // Make MP4 work for streaming.
                ])
                .format('mp4')
                .on('error', (err) => {
                    // Ignore "Output stream closed" error if data was received.
                    if (
                        err.message.includes('Output stream closed') &&
                        chunks.length > 0
                    ) {
                        if (!finished) {
                            finished = true;
                            resolve(Buffer.concat(chunks).toString('base64'));
                        }
                    } else {
                        if (!finished) {
                            finished = true;
                            reject(err);
                        }
                    }
                })
                .pipe(outputStream, { end: true });
        });
    }

    public async getAdAnalysis(videoUrl: string): Promise<string> {
        const schema = {
            description: 'Ad transcript and type info',
            type: SchemaType.OBJECT,
            properties: {
                textTranscript: {
                    type: SchemaType.STRING,
                    description: 'Transcript of the ad',
                    nullable: false,
                },
                description: {
                    type: SchemaType.STRING,
                    description: 'Description of the ad',
                    nullable: false,
                },
                whyItWorks: {
                    type: SchemaType.STRING,
                    description: 'Why this ad works',
                    nullable: false,
                },
                hook: {
                    type: SchemaType.STRING,
                    description: 'The hook of the ad',
                    nullable: false,
                },
                variations: {
                    type: SchemaType.ARRAY,
                    description: 'Variations that could be tested',
                    nullable: false,
                    items: {
                        type: SchemaType.STRING,
                        description:
                            'A specific variation that could be tested',
                        nullable: false,
                    },
                },
            },
            required: [
                'textTranscript',
                'description',
                'whyItWorks',
                'hook',
                'variations',
            ],
        };

        const prompt = `I want you to analyze this roofing video ad that has been performing well as a paid ad on Facebook. Keep text formatting in your response to a minimum.
        I want you to return the transcript of the ad word for word, in the textTranscript section.
        I want you to create a very detailed description of the ad for someone who has not seen it, in the description section.
        I want you to return the exact text of the hook of the ad, in the hook section.
        I want you to give a detailed analysis of why this ad is performing well, in the whyItWorks section. 
        Also come up with good ideas for variations that could be tested, in the variations section. Be extremely specific. Only include suggestion related to video.
 `;

        const model = this.generativeAI.getGenerativeModel({
            // model: 'gemini-1.5-flash',
            model: 'gemini-2.0-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: schema,
            },
        });

        // Downscale the video and get its Base64 data.
        // The limit for 1.5 flash is around 20MB.
        const videoData = await this.downscaleVideo(videoUrl);
        const videoPayload = {
            inlineData: {
                data: videoData,
                mimeType: 'video/mp4',
            },
        };

        const result = await model.generateContent([prompt, videoPayload]);
        const responseJson = result.response.text();
        const responseObj = JSON.parse(responseJson);
        return responseObj;
    }

    public async respondToMessage(message: string): Promise<string> {
        const model = this.generativeAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
        });

        const result = await model.generateContent([message]);
        return result.response.text();
    }
}

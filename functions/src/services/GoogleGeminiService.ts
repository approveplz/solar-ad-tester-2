import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPathImport from 'ffmpeg-static';
import { PassThrough } from 'stream';
import { getScrapedAdsFirestoreAll } from '../firestoreCloud.js';

const ffmpegPath = ffmpegPathImport as unknown as string;

ffmpeg.setFfmpegPath(ffmpegPath);

export interface AdAnalysis {
    textTranscript: string;
    description: string;
    hook: string;
}

export interface DuplicateVideoCheck {
    isVideoDuplicate: boolean;
    duplicateVideoIdentifier?: string;
    duplicateVideoReasoning: string;
    confidence: number;
}
/*
Not Currently being used
*/
export class GoogleGeminiService {
    private generativeAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        console.log(
            '[GoogleGeminiService:constructor] Instance is being created.'
        );
        this.generativeAI = new GoogleGenerativeAI(apiKey);
    }

    // Downscale a video from a URL without saving to disk.
    private async downscaleVideo(videoUrl: string): Promise<string> {
        console.log(`[GoogleGeminiService:downscaleVideo] Called`);
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
                    '-b:v 400k', // Set the target video bitrate.
                    '-maxrate 500k', // Limit the maximum video bitrate.
                    '-bufsize 1000k',
                    '-preset medium',
                    '-crf 35', // Use a higher CRF for a smaller file size.
                    '-r 15',
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
                            console.error(
                                `[GoogleGeminiService:downscaleVideo] Error: ${err.message}`
                            );
                            reject(err);
                        }
                    }
                })
                .pipe(outputStream, { end: true });
        });
    }

    async compareVideosToConfirmDuplicate(
        mainVideoUrl: string,
        duplicateVideoUrl: string
    ): Promise<boolean> {
        console.log(
            `[GoogleGeminiService:compareVideosToConfirmDuplicate] Called with mainVideoUrl: ${mainVideoUrl}, duplicateVideoUrl: ${duplicateVideoUrl}`
        );
        try {
            const schema = {
                description: 'Duplicate video check',
                type: SchemaType.OBJECT,
                properties: {
                    isVideoDuplicate: {
                        type: SchemaType.BOOLEAN,
                        description: 'Whether the video is a duplicate',
                        nullable: false,
                    },
                },
                required: ['isVideoDuplicate'],
            };

            const compareTwoVideosPrompt = `
                You are an expert in video content analysis, specializing in duplicate detection. Your task is to determine if two very similar videos are identical or variations of the same promotion.
                Compare Video A and Video B. Both videos present the same roofing offer or promotion. Determine if they are the identical advertisement, or if they are variations of the same promotion. Consider these factors rigorously:

                Visual Identity: Are the exact same scenes used in the same order? Check for differences in intro/outro screens, text overlays, and any visual elements, no matter how small.

                Audio Identity: Are the exact same voiceovers used, word for word? Compare background music, sound effects, and audio quality for any discrepancies.

                Specific Script/Messaging: Even if the core offer is the same, does the specific wording used to present the offer vary? Are different examples given, or different claims made?

                Presenters/Actors: Are the same EXACT people featured throughout both videos? Are there the same number of people doing EXACTLY the same thing? Different presenters always indicate different ads.

                The videos are only considered identical if all of these factors are perfectly consistent. If any discrepancies are detected, isDuplicateVideo should be false.
                `;

            const mainVideoData = await this.downscaleVideo(mainVideoUrl);
            const mainVideoPayload = {
                inlineData: {
                    data: mainVideoData,
                    mimeType: 'video/mp4',
                },
            };
            const duplicateVideoData = await this.downscaleVideo(
                duplicateVideoUrl
            );
            const duplicateVideoPayload = {
                inlineData: {
                    data: duplicateVideoData,
                    mimeType: 'video/mp4',
                },
            };

            const model = this.generativeAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            });

            const result = await model.generateContent([
                compareTwoVideosPrompt,
                mainVideoPayload,
                duplicateVideoPayload,
            ]);
            const compareVideosResponseJson = result.response.text();
            const compareVideosResponseObj = JSON.parse(
                compareVideosResponseJson
            );
            return compareVideosResponseObj.isVideoDuplicate;
        } catch (error) {
            console.error(
                '[GoogleGeminiService:compareVideosToConfirmDuplicate] Error:',
                error
            );
            throw error;
        }
    }

    public async getAdAnalysis(videoUrl: string): Promise<AdAnalysis> {
        console.log(`[GoogleGeminiService:getAdAnalysis] called`);
        try {
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
                    hook: {
                        type: SchemaType.STRING,
                        description: 'The hook of the ad',
                        nullable: false,
                    },
                },
                required: ['textTranscript', 'description', 'hook'],
            };

            const prompt = `I want you to analyze this roofing video ad. Do NOT include formatting in your response, including bold, or newlines.

            I want you to return the transcript of the ad word for word, in the textTranscript section.
            
            I want you to create an EXTREMELY detailed, second-by-second play-by-play description of what happens in the ad, in the description section. Explain this video to someone who has never seen it before, as if they are completely blind and rely solely on your description.
            
            Include absolutely *all* details, no matter how small they may seem. This includes:
            
            *   **Specific wording of all text on screen:** Note the font, color, size, and how it animates or appears.
            *   **Visuals described in excruciating detail:** Clothing (colors, styles, materials, specific articles), setting (indoor/outdoor, time of day, architectural details, weather conditions), demographics of people shown (age, gender, ethnicity, apparent mood, facial expressions, body language, specific actions, interactions), objects present, vehicles (make, model, color), animals, and any notable details about these visuals.
            *   **Sound:** Describe all sounds including music (genre, tempo, instrumentation, mood), voiceovers (tone, gender, accent), sound effects (specific sounds, when they occur, their intensity), and background noise.
            *   **Camera movements:** Note camera angles (close-up, wide shot, medium shot), camera movements (panning, tilting, zooming), and any special effects (slow motion, fast motion, transitions).
            *   **Sequence of events:** Detail the exact order in which everything happens, including cuts between scenes and the duration of each shot (if you can estimate).
            *   **Branding:** Note any logos, brand colors, or other branding elements that appear.
            
            Do not include timestamps in your description. Aim for maximum detail and length. Imagine you are providing a highly detailed narration for a visually impaired person.
            
            I want you to return the exact text of the hook of the ad, in the hook section. Ensure the hook is the very first line spoken or displayed that is intended to grab the viewer's attention.
            `;

            const model = this.generativeAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            });

            // The limit for 1.5 and 2.0 flash is around 20MB.
            const videoData = await this.downscaleVideo(videoUrl);

            const videoPayload = {
                inlineData: {
                    data: videoData,
                    mimeType: 'video/mp4',
                },
            };

            const result = await model.generateContent([prompt, videoPayload]);
            const responseJson = result.response.text();
            const responseObj: AdAnalysis = JSON.parse(responseJson);
            return responseObj;
        } catch (error) {
            console.error(
                `[GoogleGeminiService:getAdAnalysis] Error processing videoUrl`,
                error
            );
            throw error;
        }
    }

    public async checkIfDuplicateVideoByDescriptions(
        videoUrl: string
    ): Promise<DuplicateVideoCheck> {
        console.log(
            `[GoogleGeminiService:checkIfDuplicateVideoByDescriptions]`
        );
        try {
            const schema = {
                description: 'Duplicate video check',
                type: SchemaType.OBJECT,
                properties: {
                    isVideoDuplicate: {
                        type: SchemaType.BOOLEAN,
                        description: 'Whether the video is a duplicate',
                        nullable: false,
                    },
                    duplicateVideoIdentifier: {
                        type: SchemaType.STRING,
                        description:
                            'The video identifier of the duplicate video',
                        nullable: true,
                    },
                    duplicateVideoReasoning: {
                        type: SchemaType.STRING,
                        description: 'The reasoning for the duplicate video',
                        nullable: false,
                    },
                    confidence: {
                        type: SchemaType.NUMBER,
                        description: 'The confidence score of the duplicate',
                        nullable: false,
                    },
                },
                required: [
                    'isVideoDuplicate',
                    'duplicateVideoIdentifier',
                    'duplicateVideoReasoning',
                    'confidence',
                ],
            };

            const scrapedAdDataFirestore = await getScrapedAdsFirestoreAll();
            const otherDescriptions = scrapedAdDataFirestore
                .map(
                    (ad) =>
                        `VIDEO IDENTIFIER: ${ad.videoIdentifier}, VIDEO DESCRIPTION: ${ad.description}\n`
                )
                .join('\n');

            const prompt = `
            You are an expert in video content analysis, specializing in duplicate detection. Your task is to determine if the uploaded video is a duplicate of any of the OTHER VIDEOS based on their text descriptions.

These are all roofing videos and will likely have the same offer, but your task is to identify EXACT duplicates, not just videos that are similar in topic.

Here are the descriptions of the OTHER VIDEOS (formatted as VIDEO IDENTIFIER, VIDEO DESCRIPTION):
${otherDescriptions}

In 'isVideoDuplicate', return 'true' if the video is a duplicate of any of the other videos, and 'false' otherwise.

CRITICAL: For duplicate detection, require ALL of the following criteria to match another ad in the other ad descriptions:

Identical Visuals: Every scene must have the same actors (if applicable), clothing, setting, camera angles, lighting, and overall composition. **Specifically, ensure the individuals present are the EXACT same. Pay close attention to facial features, hair color/style, body type, and any distinguishing marks. Clothing must match identically, including color, style, and any patterns.**

Identical Scene Sequence: The order of the scenes must be exactly the same.

Matching Scene Duration: The duration of each corresponding scene must be approximately equal (within 1 second).

Exact Textual Overlays and Narration: All on-screen text and spoken words must be identical. Minor differences in phrasing disqualify the video.

'isVideoDuplicate: true' ONLY if ALL criteria match exactly. Even minor differences (e.g., a changed word, different shirt color, slightly different camera angle, different house, different worker, **different person even with similar traits**) make it 'false'.

Be EXTREMELY CONFIDENT in your determination. Ask yourself these questions for each potential match:

Am I absolutely certain beyond a reasonable doubt that the video is EXACTLY the same as another ad, and not just a similar variation?

Are ALL aspects of every scene identical? Have I meticulously checked the visuals, scene sequence, duration, and text?

Could there be any subtle differences in the actors, clothing, setting, lighting, camera angles, on-screen text, or narration? **Are the faces and bodies of the individuals demonstrably the same in every detail? Is the clothing absolutely identical?**

If you have ANY doubt, return false.

In 'confidence', return a number between 0 and 100, indicating your confidence in your determination. Assign a confidence score of 95 or higher ONLY if you are completely sure of your determination, and lower scores for less certain matches. If isVideoDuplicate is false, the confidence score should generally be high (e.g., 80 or higher) because you're confidently asserting non-duplication.

In 'duplicateVideoIdentifier', specify the exact video identifier of the matching video, if applicable. If isVideoDuplicate is false, set this to null. Make sure the video identifier is EXACTLY the same as the one in the OTHER VIDEOS section and make sure it exists. There may be multiple other videos that are duplicates. Make sure you check all of these and ONLY return the video identifier of the video that MOST CLOSELY matches uploaded video.

In 'duplicateVideoReasoning', provide a detailed and scene-specific explanation of why you believe the video is or is not a duplicate of the other video. Include specific details about the visuals, scene sequence, and textual elements that support your determination. For example: "Not a duplicate. While both videos show roof repair, this video features a red-shirted worker while the other shows a blue-shirted worker. Also, this video shows shingles being nailed in place at 0:05, while the other shows shingles being torn off at that time. **Crucially, the individuals presenting the information are different. One has a rounder face, lighter hair and is wearing a baseball cap, while the other has a longer face, darker hair, and no hat**.
`;

            const model = this.generativeAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            });

            // Downscale the video and get its Base64 data.
            // The limit for 1.5 and 2.0 flash is around 20MB.
            const videoData = await this.downscaleVideo(videoUrl);
            const videoPayload = {
                inlineData: {
                    data: videoData,
                    mimeType: 'video/mp4',
                },
            };

            const result = await model.generateContent([prompt, videoPayload]);
            const responseJson = result.response.text();
            const responseObj: DuplicateVideoCheck = JSON.parse(responseJson);

            return responseObj;
        } catch (error) {
            console.error(
                `[GoogleGeminiService:checkIfDuplicateVideoByDescriptions] Error processing videoUrl (${videoUrl}):`,
                error
            );
            throw error;
        }
    }

    public async respondToMessage(message: string): Promise<string> {
        console.log(
            `[GoogleGeminiService:respondToMessage] Called with message: ${message}`
        );
        try {
            const model = this.generativeAI.getGenerativeModel({
                model: 'gemini-1.5-flash',
            });

            const result = await model.generateContent([message]);
            return result.response.text();
        } catch (error) {
            console.error(
                '[GoogleGeminiService:respondToMessage] Error:',
                error
            );
            throw error;
        }
    }
}

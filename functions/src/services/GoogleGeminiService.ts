import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPathImport from 'ffmpeg-static';
import { PassThrough, Readable } from 'stream';
import { createWriteStream, unlink } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

ffmpeg.setFfmpegPath(ffmpegPathImport as unknown as string);

export interface AdAnalysis {
    description: string;
}

export class GoogleGeminiService {
    private generativeAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        console.log(
            '[GoogleGeminiService:constructor] Instance is being created.'
        );
        this.generativeAI = new GoogleGenerativeAI(apiKey);
    }

    // Downscale a video from a URL by downloading, processing via ffmpeg, and returning a Base64 string.
    private async downscaleVideo(videoUrl: string): Promise<string> {
        let response;
        try {
            response = await fetch(videoUrl);
        } catch (fetchError) {
            console.error(
                `[GoogleGeminiService:downscaleVideo] Error fetching URL: ${videoUrl}`,
                fetchError
            );
            throw fetchError;
        }
        if (!response.ok) {
            const errMsg = `Failed to download video: ${response.status} ${response.statusText} from URL: ${videoUrl}`;
            console.error(`[GoogleGeminiService:downscaleVideo] ${errMsg}`);
            throw new Error(errMsg);
        }
        if (!response.body) {
            const errMsg = `Failed to obtain response body from video URL: ${videoUrl}`;
            console.error(`[GoogleGeminiService:downscaleVideo] ${errMsg}`);
            throw new Error(errMsg);
        }

        // Convert the WHATWG stream (returned by fetch) into a Node.js Readable stream.
        const nodeReadable = Readable.fromWeb(response.body as any);

        // Generate a unique temporary file path using the system's temporary directory.
        const tempVideoPath = `${tmpdir()}/video-${randomBytes(6).toString(
            'hex'
        )}.mp4`;
        const fileStream = createWriteStream(tempVideoPath);

        // Pipe the downloaded video data into the temporary file.
        await new Promise<void>((resolve, reject) => {
            nodeReadable.pipe(fileStream);
            nodeReadable.on('error', reject);
            fileStream.on('finish', resolve);
        });

        // Process the downloaded video using ffmpeg.
        return new Promise((resolve, reject) => {
            let finished = false;
            // Create a PassThrough stream to capture ffmpeg's output.
            const outputStream = new PassThrough();
            // Set output encoding to Base64 to easily collect the processed video data.
            outputStream.setEncoding('base64');
            const base64Chunks: string[] = [];

            // Helper function to finalize the process and clean up.
            const finishHandler = () => {
                if (!finished) {
                    finished = true;
                    const result = base64Chunks.join('');
                    resolve(result);
                    // Delete the temporary file after processing.
                    unlink(tempVideoPath, () => {});
                }
            };

            // Accumulate the Base64-encoded data chunks from the ffmpeg output.
            outputStream.on('data', (chunk: string) => {
                base64Chunks.push(chunk);
            });
            outputStream.on('end', finishHandler);
            outputStream.on('close', finishHandler);
            outputStream.on('error', (err) => {
                console.error(
                    `[GoogleGeminiService:downscaleVideo] outputStream error: ${err.message}`
                );
                if (!finished) {
                    finished = true;
                    reject(err);
                }
            });

            ffmpeg(tempVideoPath)
                // Apply scaling to half the width and height. This handles odd dimensions.
                .videoFilters('scale=floor(iw/2/2)*2:floor(ih/2/2)*2')
                // Set encoding options.
                .outputOptions([
                    '-c:v libx264',
                    '-b:v 400k',
                    '-maxrate 500k',
                    '-bufsize 1000k',
                    '-preset medium',
                    '-crf 35',
                    '-r 15',
                    '-movflags frag_keyframe+empty_moov',
                ])
                .format('mp4')
                // For debugging.
                // .on('stderr', (stderrLine) => {
                //     console.log(
                //         `[GoogleGeminiService:downscaleVideo] ffmpeg stderr: ${stderrLine}`
                //     );
                // })
                // .on('codecData', (data) => {
                //     console.log(
                //         `[GoogleGeminiService:downscaleVideo] ffmpeg codecData:`,
                //         data
                //     );
                // })
                .on('error', (err) => {
                    // If there is an "Output stream closed" error and some data was received, try to finish.
                    if (
                        err.message.includes('Output stream closed') &&
                        base64Chunks.length > 0
                    ) {
                        finishHandler();
                    } else {
                        if (!finished) {
                            finished = true;
                            console.error(
                                `[GoogleGeminiService:downscaleVideo] Error during ffmpeg processing url: ${videoUrl}. Error: ${err.message}`
                            );
                            reject(err);
                        }
                    }
                })
                .on('end', finishHandler)
                .pipe(outputStream, { end: true });
        });
    }

    public async getAdAnalysis(videoUrl: string): Promise<AdAnalysis> {
        try {
            const schema = {
                description: 'Standardized description of the ad',
                type: SchemaType.OBJECT,
                properties: {
                    description: {
                        type: SchemaType.STRING,
                        description: 'Transcript of the ad',
                        nullable: false,
                    },
                },
                required: ['description'],
            };

            // const prompt = `I want you to analyze this roofing video ad. Do NOT include formatting in your response, including bold, or newlines.

            // I want you to return the transcript of the ad word for word, in the textTranscript section.

            // I want you to create an EXTREMELY detailed, second-by-second play-by-play description of what happens in the ad, in the description section. Explain this video to someone who has never seen it before, as if they are completely blind and rely solely on your description.

            // Include absolutely *all* details, no matter how small they may seem. This includes:

            // *   **Specific wording of all text on screen:** Note the font, color, size, and how it animates or appears.
            // *   **Visuals described in excruciating detail:** Clothing (colors, styles, materials, specific articles), setting (indoor/outdoor, time of day, architectural details, weather conditions), demographics of people shown (age, gender, ethnicity, apparent mood, facial expressions, body language, specific actions, interactions), objects present, vehicles (make, model, color), animals, and any notable details about these visuals.
            // *   **Sound:** Describe all sounds including music (genre, tempo, instrumentation, mood), voiceovers (tone, gender, accent), sound effects (specific sounds, when they occur, their intensity), and background noise.
            // *   **Camera movements:** Note camera angles (close-up, wide shot, medium shot), camera movements (panning, tilting, zooming), and any special effects (slow motion, fast motion, transitions).
            // *   **Sequence of events:** Detail the exact order in which everything happens, including cuts between scenes and the duration of each shot (if you can estimate).
            // *   **Branding:** Note any logos, brand colors, or other branding elements that appear.

            // Do not include timestamps in your description. Aim for maximum detail and length. Imagine you are providing a highly detailed narration for a visually impaired person.

            // I want you to return the exact text of the hook of the ad, in the hook section. Ensure the hook is the very first line spoken or displayed that is intended to grab the viewer's attention.
            // `;

            //             const prompt = `I want you to analyze this roofing video ad and produce a JSON-style response containing three keys: textTranscript, description, and hook.

            // textTranscript: Provide a word-for-word transcript of all spoken dialogue in the ad. Do not alter any words, and do not add or omit anything.

            // description: Provide an extremely detailed, second-by-second play-by-play of the entire video. Focus on consistency and objectivity. Use the same wording to describe each subject every time it appears, with no synonyms or rewording. For example, if you initially say "a middle-aged man wearing a green polo shirt," continue to refer to him exactly as "the middle-aged man wearing a green polo shirt" throughout. Describe everything you see or hear (text on screen, visuals, clothing, people, vehicles, backgrounds, brand elements, camera angles, music, voiceover characteristics, sound effects, and so on) in a strictly methodical, chronological order. Include no personal opinions or interpretations; only state observable facts. Provide the same level of detail for every second or change of scene.

            // hook: Provide only the first line (spoken or displayed) that is intended to catch the viewer's attention.

            // Do not include formatting of any kind, such as bold, italics, line breaks, or bullet points. Use plain text only. The output must always follow this exact structure for every response, with the same approach and the same descriptive terms for repeated runs of the same video.`;

            //             const prompt = `I want you to analyze this roofing video ad and produce a JSON-style response with three fields: textTranscript, description, and hook. The output must always follow this exact schema:

            // 1) textTranscript: A verbatim, word-for-word transcript of all spoken words.
            //    - Do not omit or add any words.
            //    - Use [UNKNOWN] if speech is unclear or indiscernible.
            //    - Spell words exactly as heard, even if they are grammatically incorrect.

            // 2) description: A moment-by-moment, event-by-event account of everything observable, from start to finish.
            //    - Assign fixed labels for recurring elements (e.g., "Person A," "Person B," "Vehicle 1," "Sign 1").
            //    - If there is a male speaker in a green shirt, always refer to him exactly as "Person A (male in green shirt)." Do not alter this phrase (no synonyms, rephrasing, or variations).
            //    - Describe each visible or audible element in the same consistent order every time. For example, always note the background setting first, then the person in frame, then clothing details, etc.
            //    - Instead of exact timestamps, use sequential phrases like "At the start," "Next," "Following that," "Immediately afterward," "Later," "Toward the end," to convey the timeline without referencing seconds.
            //    - If you cannot be certain of a detail, write [UNKNOWN]. Do not guess or infer.
            //    - Do not incorporate any personal opinions, emotive language, or interpretation. Only objective facts.

            // 3) hook: The very first line of text or spoken audio that is intended to grab the viewer's attention.
            //    - Provide it verbatim, with no additional words or commentary.

            // Important rules:
            // - Do not use any formatting such as bold, italics, bullet points, headings, or newlines.
            // - Use plain text only and follow the same sequence and sentence structure for each repeated run of the same video.
            // - Never vary your wording, synonyms, or descriptions between runs. The same video should yield the exact same output every time.
            // - If something is repeated in the video, use the same wording each time it appears.
            // - Return your response in the following template:

            // {
            //   "textTranscript": "...",
            //   "description": "...",
            //   "hook": "..."
            // }

            // Do not add or remove any keys from the JSON.`;

            const prompt = `I want you to analyze this roofing video ad give me a standardized description.

Provide an extremely detailed, moment-by-moment play-by-play of the entire video, from start to finish. Use sequential phrases like "At the start," "Next," "Following that," "Immediately afterward," "Later," "Toward the end" to convey the timeline without referencing exact seconds. Maintain strict consistency and objectivity by using the same words or labels for each subject every time they appear (no synonyms or alternate wording). 

Always describe each element in the same order: 
1) Background or setting 
2) People in frame 
3) Clothing details 
4) Actions or expressions 
5) On-screen text (font, color, size, animation) 
6) Camera angles or movements 

When describing people:
- Provide specific physical details (gender, approximate complexion, hair style/color, attire) in exactly the same format each time they appear.  
- If the attire or hair appears different in another shot, do not guess. Use [UNKNOWN] unless you are absolutely certain.  
- If you cannot determine a detail, write [UNKNOWN]. Do not guess or infer.  
If the same background is shown repeatedly, use the same wording each time. Do not use synonyms.

Do not include any formatting such as bold, italics, bullet points, or line breaks. Return plain text only.`;

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

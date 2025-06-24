import {
    getAdName,
    getDownloadUrlFromGdriveViewUrl,
    invariant,
    MediaBuyerCodes,
} from '../helpers.js';
import { getAllFilesInFolderWithSignedUrls } from '../firebaseStorageCloud.js';
import ffmpeg from 'fluent-ffmpeg';

interface CreatomateTemplate {
    output_format: string;
    width: number;
    height: number;
    elements: CreatomateElement[];
}

interface CreatomateElement {
    name: string;
    type: string;
    track: number;
    time?: number;
    y?: string;
    width?: string;
    height?: string;
    dynamic: boolean;
}

export interface CreatomateMetadata {
    baseAdName: string;
    hookName: string;
    fbAdId: string;
}

interface CreatomateRequestData {
    source: CreatomateTemplate;
    modifications: {
        [key: string]: string;
    };
    metadata: string;
    webhook_url: string;
}

export interface CreatomateRenderResponse {
    id: string;
    status: string;
    url: string;
    metadata: string;
}

interface Hook {
    name: string;
    url: string;
}

enum AspectRatio {
    Vertical = 'vertical',
    Horizontal = 'horizontal',
    Square = 'square',
}

export interface CreatomateWebhookResult {
    success: boolean;
    error?: string;
}

export interface CreatomateWebhookPayload {
    id: string;
    status: string;
    url: string;
    metadata: string;
}

//Init like this: const creatomateService = await CreatomateService.create(apiKey);
export class CreatomateService {
    private readonly apiKey: string;
    private readonly hooks: Hook[];

    private readonly creatomateRenderUrl =
        'https://api.creatomate.com/v1/renders';

    private readonly creatomateWebhookUrl =
        'https://us-central1-solar-ad-tester-2.cloudfunctions.net/handleCreatomateWebhookHttp';

    private constructor(apiKey: string, hooks: Hook[]) {
        if (!apiKey) {
            throw new Error('Creatomate API key is required');
        }
        if (!hooks || hooks.length === 0) {
            throw new Error('At least one hook is required');
        }
        this.apiKey = apiKey;
        this.hooks = hooks;
    }

    public static async create(apiKey: string): Promise<CreatomateService> {
        const hooks = await getAllFilesInFolderWithSignedUrls('hooks');
        const hooksWithoutNameExtension = hooks.map((hook) => ({
            ...hook,
            name: hook.name.replace(/\.[^/.]+$/, ''), // Removes file extension
        }));
        return new CreatomateService(apiKey, hooksWithoutNameExtension);
    }

    async uploadToCreatomateWithHooksAll(
        baseVideoViewUrl: string,
        baseAdName: string,
        fbAdId: string
    ): Promise<
        {
            hookName: string;
            creatomateRenderResponse: CreatomateRenderResponse;
        }[]
    > {
        const baseVideoDownloadUrl =
            getDownloadUrlFromGdriveViewUrl(baseVideoViewUrl);
        // Get video dimensions first
        const dimensions = await this.getVideoDimensions(baseVideoDownloadUrl);
        console.log(
            `Video dimensions: ${dimensions.width}x${dimensions.height}`
        );

        const uploadPromises = this.hooks.map(async (hook) => {
            try {
                const creatomateRenderResponse: CreatomateRenderResponse =
                    await this.uploadToCreatomateWithHookSingle(
                        baseVideoDownloadUrl,
                        hook.url,
                        baseAdName,
                        hook.name,
                        fbAdId,
                        dimensions
                    );
                console.log({
                    creatomateRenderResponse,
                });
                return {
                    hookName: hook.name,
                    creatomateRenderResponse,
                };
            } catch (error) {
                console.error(`Failed to process hook ${hook.name}:`, error);
                throw error;
            }
        });

        return Promise.all(uploadPromises);
    }

    async uploadToCreatomateWithHookSingle(
        baseVideoUrl: string,
        hookVideoUrl: string,
        baseAdName: string,
        hookName: string,
        fbAdId: string,
        dimensions: { width: number; height: number }
    ): Promise<CreatomateRenderResponse> {
        const creatomateTemplate = this.getCreatomateTemplate(
            dimensions.width,
            dimensions.height
        );

        const metadata: CreatomateMetadata = {
            baseAdName,
            hookName,
            fbAdId,
        };

        const creatomateRequestData: CreatomateRequestData = {
            source: creatomateTemplate,
            modifications: {
                'hook-video.source': hookVideoUrl,
                'main-video.source': baseVideoUrl,
            },
            metadata: JSON.stringify(metadata),
            webhook_url: this.creatomateWebhookUrl,
        };

        try {
            const response = await fetch(this.creatomateRenderUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(creatomateRequestData),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseText = await response.text();

            try {
                const responseData: CreatomateRenderResponse[] =
                    JSON.parse(responseText);
                return responseData[0];
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error(`Failed to parse response: ${responseText}`);
            }
        } catch (error) {
            console.error('Error uploading to Creatomate:', error);
            throw error;
        }
    }

    // Helpers
    private getCreatomateTemplate(
        width: number,
        height: number
    ): CreatomateTemplate {
        const mainVideoAspectRatio = width / height;

        let aspectRatio: AspectRatio;
        if (Math.abs(mainVideoAspectRatio - 16 / 9) < 0.1) {
            aspectRatio = AspectRatio.Horizontal;
        } else if (Math.abs(mainVideoAspectRatio - 9 / 16) < 0.1) {
            aspectRatio = AspectRatio.Vertical;
        } else if (Math.abs(mainVideoAspectRatio - 1) < 0.1) {
            aspectRatio = AspectRatio.Square;
        } else {
            throw new Error(
                `Unsupported aspect ratio: ${mainVideoAspectRatio.toFixed(
                    2
                )} (${width}x${height}). Video must be either 16:9 (horizontal), 9:16 (vertical), or 1:1 (square).`
            );
        }

        let creatomateTemplate: CreatomateTemplate | null = null;

        if (aspectRatio === AspectRatio.Vertical) {
            creatomateTemplate = {
                output_format: 'mp4',
                width: 1080,
                height: 1920,
                elements: [
                    {
                        name: 'hook-video',
                        type: 'video',
                        track: 1,
                        time: 0,
                        dynamic: true,
                    },
                    {
                        name: 'main-video',
                        type: 'video',
                        track: 1,
                        dynamic: true,
                    },
                ],
            };
        } else if (aspectRatio === AspectRatio.Square) {
            creatomateTemplate = {
                output_format: 'mp4',
                width: 1080,
                height: 1080,
                elements: [
                    {
                        name: 'hook-video',
                        type: 'video',
                        track: 1,
                        time: 0,
                        dynamic: true,
                    },
                    {
                        name: 'main-video',
                        type: 'video',
                        track: 1,
                        dynamic: true,
                    },
                ],
            };
        } else if (aspectRatio === AspectRatio.Horizontal) {
            creatomateTemplate = {
                output_format: 'mp4',
                width: 1920,
                height: 1080,
                elements: [
                    {
                        name: 'hook-video',
                        type: 'video',
                        track: 1,
                        time: 0,
                        dynamic: true,
                    },
                    {
                        name: 'main-video',
                        type: 'video',
                        track: 1,
                        dynamic: true,
                    },
                ],
            };
        }

        invariant(creatomateTemplate, 'Creatomate template must be defined');
        return creatomateTemplate;
    }

    private getVideoDimensions(
        videoUrl: string
    ): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoUrl, (err, metadata) => {
                if (err) {
                    reject(err);
                    return;
                }

                const videoStream = metadata.streams.find(
                    (stream) => stream.codec_type === 'video'
                );
                if (!videoStream) {
                    reject(new Error('No video stream found'));
                    return;
                }

                resolve({
                    width: videoStream.width || 0,
                    height: videoStream.height || 0,
                });
            });
        });
    }

    /**
     * Processes Creatomate webhook payload and handles the render completion
     * @param payload The webhook payload from Creatomate
     * @returns Result indicating success or failure
     */
    async handleWebhookCompletion(
        payload: CreatomateWebhookPayload
    ): Promise<CreatomateWebhookResult> {
        const {
            id: creatomateRenderId,
            status,
            url: creatomateUrl,
            metadata: metadataJSON,
        } = payload;

        try {
            const metadata: CreatomateMetadata = JSON.parse(metadataJSON);

            if (status !== 'succeeded') {
                console.log(
                    `Creatomate render ${creatomateRenderId} failed with status: ${status}`
                );
                return {
                    success: false,
                    error: 'Creatomate render failed',
                };
            }

            // Import setEventFirestore here to avoid circular dependencies
            const { setEventFirestore } = await import('../firestoreCloud.js');

            await setEventFirestore(
                `creatomate_render:${creatomateRenderId}`,
                'SUCCESS',
                {
                    creatomateMetadata: metadata,
                    creatomateUrl,
                }
            );

            console.log(
                `Successfully processed Creatomate webhook for render ${creatomateRenderId}`
            );
            return { success: true };
        } catch (error) {
            console.error(
                `Error processing Creatomate webhook for render ${creatomateRenderId}:`,
                error
            );
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred',
            };
        }
    }
}

import { getAllFilesInFolderWithSignedUrls } from '../firebaseStorageCloud.js';

interface CreatomateTemplate {
    output_format: string;
    width: number;
    height: number;
    elements: CreatomateElement[];
}

interface CreatomateElement {
    id: string;
    name: string;
    type: string;
    track: number;
    time?: number;
    y?: string;
    width?: string;
    height?: string;
    source: string;
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

interface Hook {
    name: string;
    url: string;
}

// const creatomateService = await CreatomateService.create(apiKey);
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
        baseVideoUrl: string,
        baseAdName: string,
        fbAdId: string
    ) {
        const uploadPromises = this.hooks.map(async (hook) => {
            try {
                const result = await this.uploadToCreatomateWithHookSingle(
                    baseVideoUrl,
                    hook.url,
                    baseAdName,
                    hook.name,
                    fbAdId
                );
                return {
                    hookName: hook.name,
                    result,
                };
            } catch (error) {
                console.error(`Failed to process hook ${hook.name}:`, error);
                return {
                    hookName: hook.name,
                    error: error,
                };
            }
        });

        return Promise.all(uploadPromises);
    }

    // Helpers
    private getCreatomateTemplate(): CreatomateTemplate {
        const creatomateTemplate = {
            output_format: 'mp4',
            width: 720,
            height: 1280,
            elements: [
                {
                    id: 'ceabf58e-92b4-4963-8994-0955495a3044',
                    name: 'hook-video',
                    type: 'video',
                    track: 1,
                    time: 0,
                    y: '46.0351%',
                    width: '113.7266%',
                    height: '37.0663%',
                    source: '1efba592-995d-4fc2-a084-863a996111ad',
                    dynamic: true,
                },
                {
                    id: '03fe4108-e7fe-4678-a3ce-92355d1cd44d',
                    name: 'main-video',
                    type: 'video',
                    track: 1,
                    source: '065e2f34-df0a-4f19-80f8-8e9f5ca58171',
                    dynamic: true,
                },
            ],
        };

        return creatomateTemplate;
    }

    async uploadToCreatomateWithHookSingle(
        baseVideoUrl: string,
        hookVideoUrl: string,
        baseAdName: string,
        hookName: string,
        fbAdId: string
    ) {
        const creatomateTemplate = this.getCreatomateTemplate();

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
                return JSON.parse(responseText);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error(`Failed to parse response: ${responseText}`);
            }
        } catch (error) {
            console.error('Error uploading to Creatomate:', error);
            throw error;
        }
    }
}

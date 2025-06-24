export function getAdName(
    counter: number,
    vertical: string,
    scriptWriter: string,
    ideaWriter: string,
    hookWriter: string
): string {
    return `${counter}-${vertical}-${scriptWriter}-${ideaWriter}-${hookWriter}`;
}

export function parseAdName(adName: string): {
    vertical: VerticalCodes;
    scriptWriter: MediaBuyerCodes;
    ideaWriter: MediaBuyerCodes;
    hookWriter: MediaBuyerCodes;
} {
    // Remove file extension if it exists
    const nameWithoutExtension = adName.replace(/\.[^/.]+$/, '');

    // Split by delimiter
    const parts = nameWithoutExtension.split('-');

    // Validate format (should have at least 5 parts: counter-vertical-scriptWriter-ideaWriter-hookWriter)
    if (parts.length < 5) {
        throw new Error(
            `Invalid ad name format: ${adName}. Expected format: counter-vertical-scriptWriter-ideaWriter-hookWriter`
        );
    }

    // Extract components (skip counter at index 0)
    const [counter, vertical, scriptWriter, ideaWriter, hookWriter, ...rest] =
        parts;

    // Validate enum values
    if (!Object.values(VerticalCodes).includes(vertical as VerticalCodes)) {
        throw new Error(
            `Invalid vertical code: ${vertical}. Valid values: ${Object.values(
                VerticalCodes
            ).join(', ')}`
        );
    }

    if (
        !Object.values(MediaBuyerCodes).includes(
            scriptWriter as MediaBuyerCodes
        )
    ) {
        throw new Error(
            `Invalid script writer code: ${scriptWriter}. Valid values: ${Object.values(
                MediaBuyerCodes
            ).join(', ')}`
        );
    }

    if (
        !Object.values(MediaBuyerCodes).includes(ideaWriter as MediaBuyerCodes)
    ) {
        throw new Error(
            `Invalid idea writer code: ${ideaWriter}. Valid values: ${Object.values(
                MediaBuyerCodes
            ).join(', ')}`
        );
    }

    if (
        !Object.values(MediaBuyerCodes).includes(hookWriter as MediaBuyerCodes)
    ) {
        throw new Error(
            `Invalid hook writer code: ${hookWriter}. Valid values: ${Object.values(
                MediaBuyerCodes
            ).join(', ')}`
        );
    }

    return {
        vertical: vertical as VerticalCodes,
        scriptWriter: scriptWriter as MediaBuyerCodes,
        ideaWriter: ideaWriter as MediaBuyerCodes,
        hookWriter: hookWriter as MediaBuyerCodes,
    };
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
            12, // 5 AM PDT (12:00 UTC)
            0,
            0,
            0
        )
    );

    return Math.floor(nextWeekday.getTime() / 1000);
}

export enum VerticalCodes {
    R = 'R',
    O = 'O',
}

export enum MediaBuyerCodes {
    MA = 'MA',
    BZ = 'BZ',
    AZ = 'AZ',
    FR = 'FR',
    VB = 'VB',
    MT = 'MT',
    RD = 'RD',
}

export function getAccountIdFromVertical(vertical: string): string {
    const verticalToAccountId = {
        [VerticalCodes.R]: '358423827304360',
        [VerticalCodes.O]: '822357702553382',
    };
    return verticalToAccountId[vertical as VerticalCodes] || '';
}

export function getFullVerticalName(vertical: string): string {
    const verticalFullNameMapping: Record<VerticalCodes, string> = {
        [VerticalCodes.R]: 'Roofing',
        [VerticalCodes.O]: 'GLP-1',
    };
    return verticalFullNameMapping[vertical as VerticalCodes] || vertical;
}

export const gDriveIngestrionFolderUrl =
    'https://drive.google.com/drive/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22?usp=sharing';

export const getViewUrlFromGdriveDownloadUrl = (url: string): string => {
    const idMatch = url.match(/(?:id=|\/d\/)([a-zA-Z0-9_-]{25,})/);
    if (!idMatch) {
        throw new Error('Invalid Google Drive URL format');
    }
    const fileId = idMatch[1];
    return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
};

export const getDownloadUrlFromGdriveViewUrl = (url: string): string => {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
    if (!idMatch) {
        throw new Error('Invalid Google Drive view URL format');
    }
    const fileId = idMatch[1];
    return `https://drive.google.com/uc?id=${fileId}&export=download`;
};

/**
 * Custom invariant function that preserves error messages in production
 * @param condition The condition to check
 * @param message The error message to show if condition is false
 */
export function invariant(condition: any, message: string): asserts condition {
    if (!condition) {
        throw new Error(`Invariant failed: ${message}`);
    }
}

/**
 * Checks if a URL points to a video file based on file extension
 * @param url The URL to check
 * @returns true if the URL appears to be a video file, false otherwise
 */
export function isVideoUrl(url: string): boolean {
    if (!url) return false;

    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    const urlLower = url.toLowerCase();

    return videoExtensions.some((ext) => urlLower.includes(ext));
}

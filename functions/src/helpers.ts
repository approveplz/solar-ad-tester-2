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

// import ffmpeg from 'fluent-ffmpeg';
// import ffmpegPathImport from 'ffmpeg-static';
// const ffmpegPath = ffmpegPathImport as unknown as string;

// ffmpeg.setFfmpegPath(ffmpegPath);

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

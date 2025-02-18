export interface ScrapedAdDataFirestore {
    url: string;
    videoIdentifier: string;
    adArchiveId: string;
    startTimeUnixSeconds: number;
    formattedStartTime: string;
    description: string;
    isUsed: boolean;
    wantToUse?: boolean;
    pageName: string;
    pageId: string;
    // categorization: string;
    textTranscript: string;
    hook: string;
    duplicateVideoIdentifiers?: string[];
}

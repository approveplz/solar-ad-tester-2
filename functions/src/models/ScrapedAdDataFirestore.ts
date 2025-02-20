export interface ScrapedAdDataFirestore {
    url: string;
    // videoIdentifer is also the Doc ID
    videoIdentifier: string;
    adArchiveId: string;
    startTimeUnixSeconds: number;
    formattedStartTime: string;
    description: string;
    isUsedForAd: boolean;
    processed: boolean;
    pageName: string;
    pageId: string;
    textTranscript?: string;
    hook?: string;
    duplicateVideoIdentifiers?: string[];
    descriptionEmbedding?: number[];
}

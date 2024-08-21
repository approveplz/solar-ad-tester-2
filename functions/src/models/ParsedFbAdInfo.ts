export interface ParsedFbAdInfo {
    adArchiveId: string;
    publisherPlatform: string[];
    startDateUnixSeconds: number;
    endDateUnixSeconds: number;
    adCreativeId?: string;
    pageName: string;
    pageId: number;
    pageLikeCount: number;
    videoHdUrl: string;
    videoSdUrl: string;
    videoPreviewImageUrl: string;
    hasUserReported?: boolean;
    adTitle: string;
    adBody: string;
    ctaType?: string;
}

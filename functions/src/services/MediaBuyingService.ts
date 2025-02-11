import MetaAdCreatorService from './MetaAdCreatorService.js';
import {
    BigQueryService,
    AdPerformanceDataBigQuery,
} from './BigQueryService.js';
import { CreatomateService } from './CreatomateService.js';
import { AdPerformance, PerformanceMetrics } from '../models/AdPerformance.js';
import {
    getAdPerformanceFirestoreAll,
    saveAdPerformanceFirestore,
} from '../firestoreCloud.js';
import invariant from 'tiny-invariant';
import { SkypeService } from './SkypeService.js';
import { getNextWeekdayUnixSeconds } from '../helpers.js';

export class MediaBuyingService {
    private metAdCreatorServices: Record<string, MetaAdCreatorService> = {};
    private LIFETIME_SPEND_THRESHOLD = 40;
    private LIFETIME_ROI_SCALING_THRESHOLD = 1.5;
    private LIFETIME_ROI_HOOK_THRESHOLD = 1.3;

    constructor(
        private readonly creatomateService: CreatomateService,
        private readonly bigQueryService: BigQueryService,
        private readonly skypeService: SkypeService
    ) {}

    async handleAdPerformanceUpdates() {
        const [
            bqPerformanceLast3Days,
            bqPerformanceLast7Days,
            bqPerformanceLifetime,
            firestoreAdPerformances,
        ] = await Promise.all([
            this.bigQueryService.getAdPerformance('AD_PERFORMANCE_3D'),
            this.bigQueryService.getAdPerformance('AD_PERFORMANCE_7D'),
            this.bigQueryService.getAdPerformance('AD_PERFORMANCE_LIFETIME'),
            getAdPerformanceFirestoreAll(),
        ]);

        for (const adPerformance of firestoreAdPerformances) {
            await this.processSingleAdPerformance(
                adPerformance,
                bqPerformanceLast3Days,
                bqPerformanceLast7Days,
                bqPerformanceLifetime
            );
        }
    }

    private async processSingleAdPerformance(
        adPerformance: AdPerformance,
        bqMetrics3d: AdPerformanceDataBigQuery[],
        bqMetrics7d: AdPerformanceDataBigQuery[],
        bqMetricsLifetime: AdPerformanceDataBigQuery[]
    ) {
        const fbAdId = adPerformance.fbAdId;

        if (!adPerformance.fbIsActive) return;

        adPerformance.performanceMetrics = this.buildPerformanceMetrics(
            fbAdId,
            bqMetrics3d,
            bqMetrics7d,
            bqMetricsLifetime
        );

        const fbLifetimeSpend =
            adPerformance.performanceMetrics.fb?.lifetime?.spend ?? 0;
        if (fbLifetimeSpend < this.LIFETIME_SPEND_THRESHOLD) {
            console.log(
                `Ad ${fbAdId} below spend threshold. Spend: ${fbLifetimeSpend}`
            );
            return;
        }

        const fbAccountId = adPerformance.fbAccountId;
        invariant(fbAccountId, 'fbAccountId must be defined');

        const metaService = await this.getMetaAdCreatorService(fbAccountId);
        await this.handlePerformanceBasedActions(
            adPerformance,
            metaService,
            this.skypeService
        );
    }

    private async handlePerformanceBasedActions(
        adPerformance: AdPerformance,
        metaService: MetaAdCreatorService,
        skypeService: SkypeService
    ) {
        const fbRoiLifetime =
            adPerformance.performanceMetrics.fb?.lifetime?.roi ?? 0;
        const fbRoiLast3Days =
            adPerformance.performanceMetrics.fb?.last3Days?.roi ?? 0;

        if (fbRoiLifetime < 1 || fbRoiLast3Days < 1) {
            await this.pauseUnderperformingAd(adPerformance, metaService);

            const message = `
            I've paused your ad because the ROI was under 1.00X
            
            This is the ad that I've paused:
            ${skypeService.createMessageWithAdPerformanceInfo(adPerformance)}
            `;
            await skypeService.sendMessage('ALAN', message);
        } else if (fbRoiLifetime < this.LIFETIME_ROI_HOOK_THRESHOLD) {
            console.log(
                `Ad ${
                    adPerformance.fbAdId
                } in profitable range (ROI: ${fbRoiLifetime.toFixed(
                    2
                )}). But do not create hooks or scale`
            );
        } else {
            // Handle high performance ad logic directly here
            if (
                !adPerformance.hasHooksCreated &&
                !adPerformance.isHook &&
                !adPerformance.isScaled &&
                !adPerformance.hasScaled
            ) {
                await this.createHooks(adPerformance);
                const message = `I've created hooks for your ad because the ROI was over ${
                    this.LIFETIME_ROI_HOOK_THRESHOLD
                }X
                
                This is the ad that I've created hooks for:
                ${skypeService.createMessageWithAdPerformanceInfo(
                    adPerformance
                )}
                `;
                await skypeService.sendMessage('ALAN', message);
            }

            if (
                fbRoiLifetime >= this.LIFETIME_ROI_SCALING_THRESHOLD &&
                !adPerformance.isScaled &&
                !adPerformance.hasScaled
            ) {
                const scaledAdDailyBudgetCents = 20000;
                const scaledAdPerformance = await this.handleScaling(
                    adPerformance,
                    metaService,
                    scaledAdDailyBudgetCents
                );
                const message = `I've scaled your ad for you because the ROI was over ${
                    this.LIFETIME_ROI_SCALING_THRESHOLD
                }X
                
                This is the original ad that I've scaled:
                ${skypeService.createMessageWithAdPerformanceInfo(
                    adPerformance
                )}

                This is the scaled ad that I've created for you with a daily budget of $${(
                    scaledAdDailyBudgetCents / 100
                ).toFixed(2)}:
                It will start running the next weekday.
                ${skypeService.createMessageWithAdPerformanceInfo(
                    scaledAdPerformance,
                    false
                )}
                `;
                await skypeService.sendMessage('ALAN', message);
            }
        }
    }

    private async pauseUnderperformingAd(
        adPerformance: AdPerformance,
        metaService: MetaAdCreatorService
    ) {
        await metaService.updateAdSetStatus(adPerformance.fbAdSetId, 'PAUSED');
        adPerformance.fbIsActive = false;
        await saveAdPerformanceFirestore(adPerformance.fbAdId, adPerformance);
    }

    private async createHooks(adPerformance: AdPerformance) {
        await this.creatomateService.uploadToCreatomateWithHooksAll(
            adPerformance.gDriveDownloadUrl,
            adPerformance.adName,
            adPerformance.fbAdId
        );
        adPerformance.hasHooksCreated = true;
        await saveAdPerformanceFirestore(adPerformance.fbAdId, adPerformance);
    }

    async handleScaling(
        adPerformance: AdPerformance,
        metaService: MetaAdCreatorService,
        scaledDailyBudgetCents: number
    ): Promise<AdPerformance> {
        adPerformance.hasScaled = true;
        await saveAdPerformanceFirestore(adPerformance.fbAdId, adPerformance);
        const scaledAdSet = await this.duplicateAdSetAndAdToCampaignWithUpdates(
            adPerformance.fbAdId,
            adPerformance.fbScalingCampaignId,
            scaledDailyBudgetCents,
            metaService
        );

        const scaledAdSetAds = await scaledAdSet.getAds(['id']);
        const scaledAdId = scaledAdSetAds[0].id;

        const scaledAdPerformance = {
            ...adPerformance,
            fbAdId: scaledAdId,
            fbAdSetId: scaledAdSet.id,
            performanceMetrics: {},
            hasHooksCreated: false,
            isScaled: true,
            hasScaled: false,
        };
        await saveAdPerformanceFirestore(scaledAdId, scaledAdPerformance);
        return scaledAdPerformance;
    }

    private async duplicateAdSetAndAdToCampaignWithUpdates(
        fbAdId: string,
        scalingCampaignId: string,
        dailyBudgetCents: number,
        metaService: MetaAdCreatorService
    ) {
        const adSetId = await metaService.getAdSetIdFromAdId(fbAdId);
        const nextWeekdayUnixSeconds = getNextWeekdayUnixSeconds().toString();
        const duplicatedAdSet = await metaService.duplicateAdSet(
            adSetId,
            scalingCampaignId,
            nextWeekdayUnixSeconds
        );
        console.log(
            `Successfully duplicated ad set ${adSetId} to campaign ${scalingCampaignId}`
        );

        const updateParams = {
            daily_budget: dailyBudgetCents,
        };

        await duplicatedAdSet.update([], updateParams);
        console.log(
            `Successfully updated daily budget for ad set ${adSetId} to ${dailyBudgetCents}`
        );
        return duplicatedAdSet;
    }

    private buildPerformanceMetrics(
        fbAdId: string,
        bqMetrics3d?: AdPerformanceDataBigQuery[],
        bqMetrics7d?: AdPerformanceDataBigQuery[],
        bqMetricsLifetime?: AdPerformanceDataBigQuery[]
    ): PerformanceMetrics {
        const fbMetrics3d = bqMetrics3d?.find(
            (m) => m.Platform === 'FB' && m.AdID === fbAdId
        );
        const fbMetrics7d = bqMetrics7d?.find(
            (m) => m.Platform === 'FB' && m.AdID === fbAdId
        );
        const fbMetricsLifetime = bqMetricsLifetime?.find(
            (m) => m.Platform === 'FB' && m.AdID === fbAdId
        );

        return {
            fb: {
                last3Days: {
                    spend: fbMetrics3d?.total_cost ?? 0,
                    revenue: fbMetrics3d?.total_revenue ?? 0,
                    roi: fbMetrics3d?.ROI ?? 0,
                    leads: fbMetrics3d?.leads ?? 0,
                    clicks: fbMetrics3d?.total_clicks ?? 0,
                },
                last7Days: {
                    spend: fbMetrics7d?.total_cost ?? 0,
                    revenue: fbMetrics7d?.total_revenue ?? 0,
                    roi: fbMetrics7d?.ROI ?? 0,
                    leads: fbMetrics7d?.leads ?? 0,
                    clicks: fbMetrics7d?.total_clicks ?? 0,
                },
                lifetime: {
                    spend: fbMetricsLifetime?.total_cost ?? 0,
                    revenue: fbMetricsLifetime?.total_revenue ?? 0,
                    roi: fbMetricsLifetime?.ROI ?? 0,
                    leads: fbMetricsLifetime?.leads ?? 0,
                    clicks: fbMetricsLifetime?.total_clicks ?? 0,
                },
            },
        };
    }

    private async getMetaAdCreatorService(accountId: string) {
        if (!this.metAdCreatorServices[accountId]) {
            this.metAdCreatorServices[accountId] = new MetaAdCreatorService({
                appId: process.env.FACEBOOK_APP_ID || '',
                appSecret: process.env.FACEBOOK_APP_SECRET || '',
                accessToken: process.env.FACEBOOK_ACCESS_TOKEN || '',
                accountId,
                apiVersion: '20.0',
            });
        }
        return this.metAdCreatorServices[accountId];
    }
}

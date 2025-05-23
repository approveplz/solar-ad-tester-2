import Airtable from 'airtable';
import { AdPerformance, PlatformMetrics } from '../models/AdPerformance.js';

export class AirtableService {
    private airtableBase: Airtable.Base;
    private apiKey: string;
    private baseId: string;

    constructor(apiKey: string, baseId: string) {
        if (!apiKey || !baseId) {
            throw new Error('Missing Airtable API key or Base ID');
        }

        this.apiKey = apiKey;
        this.baseId = baseId;

        console.log(`Initializing AirtableService with baseId: ${this.baseId}`);
        this.airtableBase = new Airtable({
            apiKey: this.apiKey,
        }).base(this.baseId);
    }

    public mapAdPerformanceToAirtableFields(
        adPerformance: AdPerformance
    ): object {
        console.log(
            `Mapping AdPerformance fields for ad with FB_AD_ID: ${adPerformance.fbAdId}`
        );

        // Extract FB and GA metrics
        const fbMetrics: PlatformMetrics | undefined =
            adPerformance.performanceMetrics.fb;
        const gaMetrics: PlatformMetrics | undefined =
            adPerformance.performanceMetrics.ga;

        const defaultMetrics = { revenue: 0, spend: 0 };

        const fbLast3 = fbMetrics?.last3Days || defaultMetrics;
        const gaLast3 = gaMetrics?.last3Days || defaultMetrics;
        const fbLast7 = fbMetrics?.last7Days || defaultMetrics;
        const gaLast7 = gaMetrics?.last7Days || defaultMetrics;
        const fbLifetime = fbMetrics?.lifetime || defaultMetrics;
        const gaLifetime = gaMetrics?.lifetime || defaultMetrics;

        // Compute totals for Last 3 Days
        const totalRevenueLast3 = fbLast3.revenue + gaLast3.revenue;
        const totalSpendLast3 = fbLast3.spend + gaLast3.spend;
        const totalProfitLast3 = totalRevenueLast3 - totalSpendLast3;
        const totalRoiLast3 =
            totalSpendLast3 !== 0 ? totalRevenueLast3 / totalSpendLast3 : 0;

        // Compute totals for Last 7 Days
        const totalRevenueLast7 = fbLast7.revenue + gaLast7.revenue;
        const totalSpendLast7 = fbLast7.spend + gaLast7.spend;
        const totalProfitLast7 = totalRevenueLast7 - totalSpendLast7;
        const totalRoiLast7 =
            totalSpendLast7 !== 0 ? totalRevenueLast7 / totalSpendLast7 : 0;

        // Compute totals for Lifetime
        const totalRevenueLifetime = fbLifetime.revenue + gaLifetime.revenue;
        const totalSpendLifetime = fbLifetime.spend + gaLifetime.spend;
        const totalProfitLifetime = totalRevenueLifetime - totalSpendLifetime;
        const totalRoiLifetime =
            totalSpendLifetime !== 0
                ? totalRevenueLifetime / totalSpendLifetime
                : 0;

        return {
            FB_AD_ID: adPerformance.fbAdId,
            AD_NAME: adPerformance.adName,
            FB_ACCOUNT_ID: adPerformance.fbAccountId,
            FB_ACTIVE_STATUS: adPerformance.fbIsActive,
            FB_REVENUE_LAST_3: fbLast3.revenue,
            FB_REVENUE_LAST_7: fbLast7.revenue,
            FB_REVENUE_LIFETIME: fbLifetime.revenue,
            FB_SPEND_LAST_3: fbLast3.spend,
            FB_SPEND_LAST_7: fbLast7.spend,
            FB_SPEND_LIFETIME: fbLifetime.spend,

            GA_REVENUE_LAST_3: gaLast3.revenue,
            GA_REVENUE_LAST_7: gaLast7.revenue,
            GA_REVENUE_LIFETIME: gaLifetime.revenue,
            GA_SPEND_LAST_3: gaLast3.spend,
            GA_SPEND_LAST_7: gaLast7.spend,
            GA_SPEND_LIFETIME: gaLifetime.spend,

            GDRIVE_LINK: adPerformance.gDriveDownloadUrl,
            HOOK_WRITER: adPerformance.hookWriter,
            IDEA_CREATOR: adPerformance.ideaWriter,
            SCRIPT_WRITER: adPerformance.scriptWriter,

            TOTAL_PROFIT_LAST_3: totalProfitLast3,
            TOTAL_PROFIT_LAST_7: totalProfitLast7,
            TOTAL_PROFIT_LIFETIME: totalProfitLifetime,
            TOTAL_REVENUE_LAST_3: totalRevenueLast3,
            TOTAL_REVENUE_LAST_7: totalRevenueLast7,
            TOTAL_REVENUE_LIFETIME: totalRevenueLifetime,
            TOTAL_ROI_LAST_3: totalRoiLast3,
            TOTAL_ROI_LAST_7: totalRoiLast7,
            TOTAL_ROI_LIFETIME: totalRoiLifetime,
            TOTAL_SPEND_LAST_3: totalSpendLast3,
            TOTAL_SPEND_LAST_7: totalSpendLast7,
            TOTAL_SPEND_LIFETIME: totalSpendLifetime,

            VERTICAL: adPerformance.vertical,
        };
    }

    public async updateRecord(recordId: string, fields: object): Promise<void> {
        console.log(
            `Attempting to update Airtable record with ID: ${recordId}`
        );
        try {
            await this.airtableBase('AD_PERFORMANCE').update([
                {
                    id: recordId,
                    fields: this.sanitizeFields(fields),
                },
            ]);
            console.log(`Successfully updated Airtable record: ${recordId}`);
        } catch (error) {
            console.error('Error updating Airtable record:', error);
            throw error;
        }
    }

    public async createOrUpdateRecord(
        firestoreId: string, // The Firestore Document ID is AdPerformance.fbAdId
        adPerformance: AdPerformance
    ): Promise<void> {
        console.log(
            `Attempting to sync record for Firestore ID: ${firestoreId}`
        );
        const fields = this.mapAdPerformanceToAirtableFields(adPerformance);

        try {
            // Check if record exists
            const existingRecords = await this.airtableBase('AD_PERFORMANCE')
                .select({
                    filterByFormula: `{FB_AD_ID} = '${firestoreId}'`,
                })
                .firstPage();

            if (existingRecords.length > 0) {
                console.log(
                    `Record found (${existingRecords.length} records). Updating Airtable record with ID: ${existingRecords[0].id}`
                );
                await this.updateRecord(existingRecords[0].id, fields);
                console.log(
                    `Successfully updated record for Firestore ID: ${firestoreId}`
                );
            } else {
                console.log(
                    'No existing Airtable record found. Creating a new record.'
                );
                await this.airtableBase('AD_PERFORMANCE').create([
                    { fields: this.sanitizeFields(fields) },
                ]);
                console.log(
                    `Successfully created new Airtable record for Firestore ID: ${firestoreId}`
                );
            }
        } catch (error) {
            console.error('Error syncing to Airtable:', error);
            throw error;
        }
    }

    /**
     * Creates a new script record in the SCRIPTS Airtable table
     *
     * @param scriptId - Unique identifier for the script
     * @param writer - The writer of the script
     * @param vertical - The vertical (category) of the script
     * @param script - The actual script content
     * @returns The ID of the created record
     */
    public async createScriptRecord(
        scriptId: string,
        writer: string,
        vertical: string,
        script: string
    ): Promise<string> {
        console.log(
            `Creating new script record in SCRIPTS table with ScriptID: ${scriptId}`
        );

        try {
            const fields = {
                ScriptID: scriptId,
                Writer: writer,
                Vertical: vertical,
                Script: script,
            };

            const sanitizedFields = this.sanitizeFields(fields);

            const records = await this.airtableBase('SCRIPTS').create([
                { fields: sanitizedFields },
            ]);

            if (!records || records.length === 0) {
                throw new Error(
                    'Failed to create Airtable record: No record returned'
                );
            }

            const recordId = records[0].id;
            console.log(
                `Successfully created script record in SCRIPTS with ScriptID: ${scriptId}`
            );

            return recordId;
        } catch (error) {
            console.error(
                `Error creating script record in Airtable SCRIPTS:`,
                error
            );
            throw error;
        }
    }

    /**
     * Creates a new record in the AD_AUTOMATION Airtable table
     *
     * @param downloadUrl - The Google Drive download URL
     * @param vertical - The vertical (category) of the ad
     * @param scriptWriter - The writer of the script
     * @param ideaWriter - The creator of the idea
     * @param hookWriter - The writer of the hook
     * @returns The ID of the created record
     */
    public async updateAdAutomationRecord(
        downloadUrl: string,
        vertical: string,
        scriptWriter: string,
        ideaWriter: string,
        hookWriter: string,
        mediaType: string,
        viewUrl: string,
        originalFileName: string
    ): Promise<string> {
        console.log(
            `Creating new AD_AUTOMATION record with downloadUrl: ${downloadUrl}`
        );

        try {
            const fields = {
                DOWNLOAD_URL: downloadUrl,
                VERTICAL: vertical,
                SCRIPT_WRITER: scriptWriter,
                IDEA_WRITER: ideaWriter,
                HOOK_WRITER: hookWriter,
                MEDIA_TYPE: mediaType,
                VIEW_URL: viewUrl,
                ORIGINAL_FILE_NAME: originalFileName,
            };

            const sanitizedFields = this.sanitizeFields(fields);

            const records = await this.airtableBase('AD_AUTOMATION').create([
                { fields: sanitizedFields },
            ]);

            if (!records || records.length === 0) {
                throw new Error(
                    'Failed to create Airtable record: No record returned'
                );
            }

            const recordId = records[0].id;
            console.log(
                `Successfully created new AD_AUTOMATION record with ID: ${recordId}`
            );

            return recordId;
        } catch (error) {
            console.error(
                `Error creating AD_AUTOMATION record in Airtable:`,
                error
            );
            throw error;
        }
    }

    // Remove undefined values to prevent Airtable errors
    private sanitizeFields(fields: object): object {
        console.log('Sanitizing fields:', fields);
        return Object.fromEntries(
            Object.entries(fields).filter(
                ([_, v]) => v !== undefined && v !== null
            )
        );
    }
}

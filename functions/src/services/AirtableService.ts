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

    public mapAdPerformanceToAirtableFieldsAdPerformance(
        adPerformance: AdPerformance
    ): object {
        console.log(
            `Mapping AdPerformance fields for ad with FB_AD_ID: ${adPerformance.fbAdId}`
        );

        // Extract FB metrics
        const fbMetrics: PlatformMetrics | undefined =
            adPerformance.performanceMetrics.fb;

        const defaultMetrics = {
            revenue: 0,
            spend: 0,
            clicks: 0,
            engagements: 0,
            partials: 0,
            leads: 0,
        };

        const fbLifetime = fbMetrics?.lifetime || defaultMetrics;

        // Compute totals for Lifetime (FB only)
        const totalRevenueLifetime = fbLifetime.revenue;
        const totalSpendLifetime = fbLifetime.spend;

        return {
            AD_NAME: adPerformance.adName,
            FB_IS_ACTIVE: adPerformance.fbIsActive,
            CLICKS: fbLifetime.clicks,
            ENGAGEMENTS: fbLifetime.engagements,
            PARTIALS: fbLifetime.partials,
            AQUISITIONS: fbLifetime.leads,
            VIEW_URL: adPerformance.gDriveDownloadUrl,
            REVENUE: totalRevenueLifetime,
            SPEND: totalSpendLifetime,
            VERTICAL: adPerformance.vertical,
        };
    }

    public async updateRecordAdPerformance(
        recordId: string,
        fields: object
    ): Promise<void> {
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

    public async createOrUpdateRecordAdPerformance(
        adPerformance: AdPerformance
    ): Promise<void> {
        const fields =
            this.mapAdPerformanceToAirtableFieldsAdPerformance(adPerformance);

        try {
            // Check if record exists
            const existingRecords = await this.airtableBase('AD_PERFORMANCE')
                .select({
                    filterByFormula: `{AD_NAME} = '${adPerformance.adName}'`,
                })
                .firstPage();

            if (existingRecords.length > 0) {
                console.log(
                    `Record found (${existingRecords.length} records). Updating Airtable record for ad name: ${adPerformance.adName}`
                );
                await this.updateRecordAdPerformance(
                    existingRecords[0].id,
                    fields
                );
            } else {
                console.log(
                    `No existing Airtable record found. Creating a new record for ad name: ${adPerformance.adName}`
                );
                await this.airtableBase('AD_PERFORMANCE').create([
                    { fields: this.sanitizeFields(fields) },
                ]);
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

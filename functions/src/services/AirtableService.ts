import Airtable from 'airtable';
import {
    AdPerformance,
    AdPerformanceByAdName,
    PlatformMetrics,
} from '../models/AdPerformance.js';

interface FilterConfig {
    field: string;
    value: string;
}

export class AirtableService {
    private airtableBase: Airtable.Base;
    private apiKey: string;
    private baseId: string;
    private AD_PERFORMANCE_TABLE_NAME = 'AD_PERFORMANCE';
    private AD_PERFORMANCE_BY_AD_NAME_TABLE_NAME = 'AD_PERFORMANCE_BY_NAME';

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

    /**
     * Generic method to update a record in any Airtable table
     */
    private async updateRecord(
        tableName: string,
        recordId: string,
        fields: object
    ): Promise<void> {
        console.log(
            `Attempting to update ${tableName} record with ID: ${recordId}`
        );
        try {
            await this.airtableBase(tableName).update([
                {
                    id: recordId,
                    fields: this.sanitizeFields(fields),
                },
            ]);
            console.log(
                `Successfully updated ${tableName} record: ${recordId}`
            );
        } catch (error) {
            console.error(`Error updating ${tableName} record:`, error);
            throw error;
        }
    }

    /**
     * Generic method to create a record in any Airtable table
     */
    private async createRecord(
        tableName: string,
        fields: object
    ): Promise<string> {
        console.log(`Creating new record in ${tableName} table`);
        try {
            const sanitizedFields = this.sanitizeFields(fields);
            const records = await this.airtableBase(tableName).create([
                { fields: sanitizedFields },
            ]);

            if (!records || records.length === 0) {
                throw new Error(
                    `Failed to create ${tableName} record: No record returned`
                );
            }

            const recordId = records[0].id;
            console.log(
                `Successfully created ${tableName} record with ID: ${recordId}`
            );
            return recordId;
        } catch (error) {
            console.error(`Error creating ${tableName} record:`, error);
            throw error;
        }
    }

    /**
     * Generic method to find existing records based on filter criteria
     */
    private async findExistingRecord(
        tableName: string,
        filterConfig: FilterConfig
    ): Promise<Airtable.Record<any> | null> {
        try {
            const existingRecords = await this.airtableBase(tableName)
                .select({
                    filterByFormula: `{${filterConfig.field}} = '${filterConfig.value}'`,
                })
                .firstPage();

            return existingRecords.length > 0 ? existingRecords[0] : null;
        } catch (error) {
            console.error(
                `Error finding existing record in ${tableName}:`,
                error
            );
            throw error;
        }
    }

    /**
     * Generic method to create or update a record based on existence
     */
    private async createOrUpdateRecord(
        tableName: string,
        fields: object,
        filterConfig: FilterConfig,
        itemName: string
    ): Promise<void> {
        try {
            const existingRecord = await this.findExistingRecord(
                tableName,
                filterConfig
            );

            if (existingRecord) {
                console.log(
                    `Record found. Updating ${tableName} record for: ${itemName}`
                );
                await this.updateRecord(tableName, existingRecord.id, fields);
            } else {
                console.log(
                    `No existing ${tableName} record found. Creating a new record for: ${itemName}`
                );
                await this.createRecord(tableName, fields);
            }
        } catch (error) {
            console.error(`Error syncing to ${tableName}:`, error);
            throw error;
        }
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
            FB_AD_ID: adPerformance.fbAdId,
        };
    }

    public async createOrUpdateRecordAdPerformance(
        adPerformance: AdPerformance
    ): Promise<void> {
        const fields =
            this.mapAdPerformanceToAirtableFieldsAdPerformance(adPerformance);
        const filterConfig: FilterConfig = {
            field: 'FB_AD_ID',
            value: adPerformance.fbAdId,
        };

        await this.createOrUpdateRecord(
            this.AD_PERFORMANCE_TABLE_NAME,
            fields,
            filterConfig,
            adPerformance.adName
        );
    }

    public mapAdPerformanceByAdNameToAirtableFields(
        adPerformanceByAdName: AdPerformanceByAdName
    ): object {
        console.log(
            `Mapping AdPerformanceByAdName fields for ad: ${adPerformanceByAdName.adName}`
        );

        // Extract FB metrics
        const fbMetrics: PlatformMetrics | undefined =
            adPerformanceByAdName.performanceMetrics.fb;

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
            AD_NAME: adPerformanceByAdName.adName,
            FB_IS_ACTIVE: adPerformanceByAdName.fbIsActive,
            CLICKS: fbLifetime.clicks,
            ENGAGEMENTS: fbLifetime.engagements,
            PARTIALS: fbLifetime.partials,
            AQUISITIONS: fbLifetime.leads,
            VIEW_URL: adPerformanceByAdName.gDriveDownloadUrl,
            REVENUE: totalRevenueLifetime,
            SPEND: totalSpendLifetime,
            IDEA_WRITER: adPerformanceByAdName.ideaWriter,
            SCRIPT_WRITER: adPerformanceByAdName.scriptWriter,
            HOOK_WRITER: adPerformanceByAdName.hookWriter,
        };
    }

    public async createOrUpdateRecordAdPerformanceByAdName(
        adPerformanceByAdName: AdPerformanceByAdName
    ): Promise<void> {
        const fields = this.mapAdPerformanceByAdNameToAirtableFields(
            adPerformanceByAdName
        );
        const filterConfig: FilterConfig = {
            field: 'AD_NAME',
            value: adPerformanceByAdName.adName,
        };

        await this.createOrUpdateRecord(
            this.AD_PERFORMANCE_BY_AD_NAME_TABLE_NAME,
            fields,
            filterConfig,
            adPerformanceByAdName.adName
        );
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
        const fields = {
            ScriptID: scriptId,
            Writer: writer,
            Vertical: vertical,
            Script: script,
        };

        return await this.createRecord('SCRIPTS', fields);
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

        return await this.createRecord('AD_AUTOMATION', fields);
    }

    // Remove empty values to prevent Airtable errors
    private sanitizeFields(fields: object): object {
        console.log('Sanitizing fields:', fields);
        return Object.fromEntries(
            Object.entries(fields).filter(([key, value]) => {
                // Filter out null, undefined, and empty strings
                const isValidValue =
                    value !== undefined &&
                    value !== null &&
                    !(typeof value === 'string' && value.trim() === '');

                return isValidValue;
            })
        );
    }
}

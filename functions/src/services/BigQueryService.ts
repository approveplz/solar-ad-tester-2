import { BigQuery } from '@google-cloud/bigquery';

interface DateValue {
    value: string;
}

export interface AdPerformanceDataBigQuery {
    start_date: DateValue;
    end_date: DateValue;
    Platform: 'FB' | 'GA';
    AdID: string;
    Imageadname: string;
    total_cost: number;
    total_clicks: number;
    total_ad_impressions: number;
    leads: number;
    c2c: number;
    total_phone_impressions: number;
    engagements: number;
    total_partials: number;
    total_revenue: number;
    profit: number;
    ROI: number;
}

export class BigQueryService {
    private bigQueryClient: BigQuery;
    private bigQueryProjectId: string;
    private datasetId: string;

    constructor() {
        this.bigQueryProjectId = 'leadspedia-350318';
        this.datasetId = 'AD_REPORTING';

        this.bigQueryClient = new BigQuery({
            projectId: this.bigQueryProjectId,
        });
    }

    private async query(query: string) {
        const [rows] = await this.bigQueryClient.query(query);
        return rows;
    }

    async getAdPerformance(
        tableId: string
        // platform: 'FB' | 'GA'
    ): Promise<AdPerformanceDataBigQuery[]> {
        const query = `
            SELECT * FROM \`${this.bigQueryProjectId}.${this.datasetId}.${tableId}\`
        `;
        const rows = await this.query(query);
        return rows;
    }
}

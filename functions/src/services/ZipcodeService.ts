import { Agent } from 'undici';
import { parse } from 'csv-parse/sync';

export interface CsvRecord {
    taskId: number;
    category: string;
    task: string;
    zipCode: string;
    density: number;
    avg: number;
}

export class ZipcodeService {
    public async getUpdatedCsvRecords(): Promise<{
        date: string;
        records: CsvRecord[];
    }> {
        // Get today's date in PDT as "YYYYMMDD"
        const pdtDateStr = new Date().toLocaleDateString('sv-SE', {
            timeZone: 'America/Los_Angeles',
        });
        // pdtDateStr is in "YYYY-MM-DD"; remove dashes to get "YYYYMMDD"
        const [year, month, day] = pdtDateStr.split('-');
        const dateStr = `${year}${month}${day}`;

        const fileUrl = `https://nx-live.s3.amazonaws.com/prices/affiliate_demand_${dateStr}.csv`;
        console.log(`Fetching CSV from URL: ${fileUrl}`);

        // Create a local custom agent with extended timeout settings
        const localAgent = new Agent({
            connectTimeout: 60 * 1000, // 1 minute to establish the TCP connection
            headersTimeout: 60 * 1000, // 1 minute to wait for response headers
            bodyTimeout: 3 * 60 * 1000, // 3 minutes to receive the response body
        });

        try {
            const response = await fetch(fileUrl, {
                dispatcher: localAgent, // Use the custom agent
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (compatible; FirebaseCloudFunctions)',
                },
            } as RequestInit);

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch CSV. Status: ${response.status}`
                );
            }

            const csvText = await response.text();
            const records = this.parseCsvRecords(csvText);
            const filteredRecords = this.filterRoofingRecords(records);

            return { date: dateStr, records: filteredRecords };
        } catch (error) {
            console.error('Error in getUpdatedCsvRecords:', error);
            throw error;
        }
    }

    public parseCsvRecords(csvData: string): CsvRecord[] {
        if (!csvData) {
            return [];
        }

        try {
            const records: any[] = parse(csvData, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            });

            const parsedRecords = records
                .map((record) => {
                    const cleanedZip = this.cleanZip(record['zip_code']);
                    if (!cleanedZip) {
                        return null;
                    }
                    return {
                        taskId: Number(record['task_id']),
                        category: String(record['category']),
                        task: String(record['task']),
                        zipCode: cleanedZip,
                        density: Number(record['density']),
                        avg: Number(record['avg']),
                    } as CsvRecord;
                })
                .filter((record): record is CsvRecord => record !== null);

            return parsedRecords;
        } catch (error) {
            console.error('CSV parsing error:', error);
            return [];
        }
    }

    cleanZip(zipCode: string | number | null | undefined): string | null {
        if (zipCode == null) return null;

        let zip: string = zipCode.toString().trim();

        // Remove Excel-style formatting if present (e.g., = "03038")
        if (zip.startsWith('="') && zip.endsWith('"')) {
            zip = zip.slice(2, -1);
        }

        // Remove any decimal portion (e.g., "12345.0" becomes "12345")
        zip = zip.split('.')[0];

        // Remove all non-digit characters
        zip = zip.replace(/\D/g, '');
        if (!zip) return null;

        // Ensure zip is exactly 5 digits: pad with leading zeros if needed, otherwise truncate
        return zip.padStart(5, '0').slice(0, 5);
    }

    filterRoofingRecords(records: CsvRecord[]): CsvRecord[] {
        const roofingCategories = [
            'Roof Install or Replace',
            'Roof Install - Natural Slate',
            'Roof Install-Wood Shake/Comp.',
            'Roof Install/Replace - Metal',
            'Roof Install or Replace - Tile',
            'Roof Install - Flat/Single Ply',
            'Roof Repair',
            'Roof Repair - Flat/Single Ply',
            'Roof Repair - Metal',
            'Roof Repair - Traditional Tile',
            'Roof Repair - Natural Slate',
        ];

        return records.filter((record) =>
            roofingCategories.includes(record.category)
        );
    }
}

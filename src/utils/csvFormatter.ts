export interface CsvFormatOptions {
    truncated?: boolean;
    limit?: number;
}

/**
 * Converts an array of JSON objects (typically returned by MySQL)
 * to a tabular CSV format to save LLM tokens.
 */
export function jsonToCsv(data: Record<string, any>[], options?: CsvFormatOptions): string {
    if (!data || data.length === 0) {
        return "No data returned.";
    }

    const headers = Object.keys(data[0]);
    const csvRows = [];

    csvRows.push(headers.join(","));

    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header];
            if (val === null || val === undefined) {
                return "∅";
            }
            const strVal = String(val);
            if (strVal.includes(",") || strVal.includes("\"") || strVal.includes("\n") || strVal === "∅") {
                return `"${strVal.replace(/"/g, "\"\"")}"`;
            }
            return strVal;
        });
        csvRows.push(values.join(","));
    }

    let output = csvRows.join("\n");

    if (options?.truncated) {
        const limit = options.limit ?? data.length;
        output += `\n-- rows: ${data.length} (truncated at LIMIT ${limit})`;
    }

    return output;
}

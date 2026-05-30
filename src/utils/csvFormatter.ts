/**
 * Converts an array of JSON objects (typically returned by MySQL)
 * to a tabular CSV format to save LLM tokens.
 */
export function jsonToCsv(data: Record<string, any>[]): string {
    if (!data || data.length === 0) {
        return "No data returned.";
    }

    const headers = Object.keys(data[0]);
    const csvRows = [];

    // Add headers
    csvRows.push(headers.join(","));

    // Add rows
    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header];
            if (val === null || val === undefined) {
                return "";
            }
            // If the value contains commas, quotes, or newlines, it must be escaped
            const strVal = String(val);
            if (strVal.includes(",") || strVal.includes("\"") || strVal.includes("\n")) {
                return `"${strVal.replace(/"/g, "\"\"")}"`;
            }
            return strVal;
        });
        csvRows.push(values.join(","));
    }

    return csvRows.join("\n");
}

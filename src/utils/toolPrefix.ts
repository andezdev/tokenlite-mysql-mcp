export function deriveToolPrefix(randomSuffix?: string): string {
    let prefix = process.env.TOOL_PREFIX;
    if (!prefix) {
        const dbName = process.env.DB_NAME;
        if (dbName) {
            prefix = `${dbName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_`;
        } else {
            const randomStr = randomSuffix ?? Math.random().toString(36).substring(2, 6);
            prefix = `db_${randomStr}_`;
        }
    }
    return prefix;
}

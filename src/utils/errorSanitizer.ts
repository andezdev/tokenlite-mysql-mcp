const KNOWN_ERROR_MESSAGES: Record<string, string> = {
    ER_BAD_FIELD_ERROR: 'A referenced column does not exist in the database.',
    ER_NO_SUCH_TABLE: 'A referenced table does not exist in the database.',
    ER_PARSE_ERROR: 'The SQL statement could not be parsed by the database.',
    ER_TABLEACCESS_DENIED_ERROR: 'Access to the requested table was denied.',
    ER_DBACCESS_DENIED_ERROR: 'Access to the requested database was denied.',
    ER_ACCESS_DENIED_ERROR: 'Database access was denied for the configured user.',
    PROTOCOL_SEQUENCE_TIMEOUT: 'The query exceeded the configured execution timeout.',
};

const SENSITIVE_PATTERNS = [
    /at\s+[\w./\\-]+:\d+:\d+/gi,
    /\/[\w./\\-]+\.(ts|js):\d+/gi,
    /password/gi,
    /ER_[A-Z0-9_]+/g,
];

export function sanitizeDatabaseError(error: unknown): string {
    if (!(error instanceof Error)) {
        return 'An unexpected database error occurred.';
    }

    const err = error as Error & { code?: string };

    if (err.name === 'OptimizerError' || err.name === 'RateLimitError') {
        return err.message;
    }

    if (err.message?.startsWith('Security Error:')) {
        return err.message;
    }

    if (err.code && KNOWN_ERROR_MESSAGES[err.code]) {
        return KNOWN_ERROR_MESSAGES[err.code];
    }

    if (err.message?.includes('timeout') || err.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
        return KNOWN_ERROR_MESSAGES.PROTOCOL_SEQUENCE_TIMEOUT;
    }

    if (err.message?.includes('Unknown column')) {
        return KNOWN_ERROR_MESSAGES.ER_BAD_FIELD_ERROR;
    }

    let message = err.message || 'An unexpected database error occurred.';
    for (const pattern of SENSITIVE_PATTERNS) {
        message = message.replace(pattern, '').trim();
    }

    if (!message) {
        return 'An unexpected database error occurred.';
    }

    return message;
}

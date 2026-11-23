import pkg from 'node-sql-parser';
const { Parser } = pkg;

/**
 * SQL policy enforced on every statement after parsing (fail-closed).
 *
 * It complements, never replaces, database-level privileges: the MySQL user the server connects
 * with should only be able to read what it is meant to read. The policy blocks the classic ways an
 * LLM-generated statement escapes that intent (server file access, other schemas, server
 * variables, timing/locking functions, executable comments) even when the account has broader
 * privileges than it should.
 */

export class SqlPolicyError extends Error {
    constructor(message: string) {
        super(`Security Error: ${message}`);
        this.name = 'SqlPolicyError';
    }
}

export interface SqlPolicyOptions {
    /** Schema that unqualified table names resolve to (DB_NAME). */
    defaultSchema: string;
    /** Schemas statements may reference, lower-cased. Defaults to [defaultSchema]. */
    allowedSchemas: Set<string>;
    /** Allow SHOW statements (off by default: they bypass schema scoping). */
    allowShow: boolean;
    /** Function names (upper-cased) that are always rejected. */
    deniedFunctions: Set<string>;
}

/**
 * Functions that are rejected regardless of configuration:
 * server file access, timing / DoS, locks, replication waits, environment disclosure and well-known
 * command-execution UDFs.
 */
export const DEFAULT_DENIED_FUNCTIONS: readonly string[] = [
    // Server file system
    'LOAD_FILE',
    // Timing / resource exhaustion
    'SLEEP', 'BENCHMARK',
    // Locks (can block other sessions)
    'GET_LOCK', 'RELEASE_LOCK', 'RELEASE_ALL_LOCKS', 'IS_FREE_LOCK', 'IS_USED_LOCK',
    // Replication waits (block the connection)
    'MASTER_POS_WAIT', 'SOURCE_POS_WAIT', 'MASTER_GTID_WAIT',
    'WAIT_FOR_EXECUTED_GTID_SET', 'WAIT_UNTIL_SQL_THREAD_AFTER_GTIDS',
    // Environment / account disclosure
    'USER', 'CURRENT_USER', 'SESSION_USER', 'SYSTEM_USER', 'CURRENT_ROLE',
    'DATABASE', 'SCHEMA', 'VERSION', 'CONNECTION_ID',
    // Command-execution UDFs (lib_mysqludf_sys and similar)
    'SYS_EXEC', 'SYS_EVAL', 'SYS_GET', 'SYS_SET',
];

/** Schemas that expose server internals; only reachable when explicitly listed in MCP_ALLOWED_SCHEMAS. */
export const SYSTEM_SCHEMAS: readonly string[] = ['information_schema', 'mysql', 'performance_schema', 'sys'];

export interface SqlPolicyInput {
    /** Schema that unqualified table names resolve to. */
    database: string;
    /** Extra schemas statements may reference (the database is always included). */
    allowedSchemas?: readonly string[];
    allowShow?: boolean;
    /** Functions rejected in addition to {@link DEFAULT_DENIED_FUNCTIONS}. */
    denyFunctions?: readonly string[];
}

/** Builds the policy options from explicit values. Empty `allowedSchemas` means "only `database`". */
export function buildSqlPolicyOptions(input: SqlPolicyInput): SqlPolicyOptions {
    const defaultSchema = input.database;
    const configured = (input.allowedSchemas ?? []).map((s) => s.toLowerCase());
    const allowedSchemas = new Set(configured.length > 0 ? configured : [defaultSchema.toLowerCase()]);
    allowedSchemas.add(defaultSchema.toLowerCase());

    const deniedFunctions = new Set(DEFAULT_DENIED_FUNCTIONS);
    for (const fn of input.denyFunctions ?? []) {
        deniedFunctions.add(fn.toUpperCase());
    }

    return {
        defaultSchema,
        allowedSchemas,
        allowShow: input.allowShow === true,
        deniedFunctions,
    };
}

/** MySQL/MariaDB executable comments (`/*!50000 ... *\/`, `/*M! ... *\/`) run their content as SQL. */
const EXECUTABLE_COMMENT = /\/\*\s*M?!/i;

/** Checks that must run on the raw text, before the parser normalises it away. */
export function assertRawSqlAllowed(sql: string): void {
    if (sql.includes('\0')) {
        throw new SqlPolicyError('NUL bytes are not allowed in SQL.');
    }
    if (EXECUTABLE_COMMENT.test(sql)) {
        throw new SqlPolicyError('Executable comments (/*! ... */) are not allowed.');
    }
}

/** True when the text is a SHOW statement once leading comments and whitespace are removed. */
export function isShowStatement(sql: string): boolean {
    const stripped = sql.replace(/^(\s+|\/\*[\s\S]*?\*\/|(--|#)[^\n]*\n?)*/, '');
    return /^SHOW\b/i.test(stripped);
}

function resolveFunctionName(node: any): { name: string; schema: string | null } | null {
    if (node.type === 'aggr_func') {
        return typeof node.name === 'string' ? { name: node.name, schema: null } : null;
    }
    const nameNode = node.name;
    if (typeof nameNode === 'string') return { name: nameNode, schema: null };
    const parts = nameNode?.name;
    if (!Array.isArray(parts) || parts.length === 0) return null;
    const values = parts.map((p: any) => p?.value);
    if (values.some((v: unknown) => typeof v !== 'string' || v.length === 0)) return null;
    const schemaValue = nameNode.schema?.value;
    return {
        name: values.join('.'),
        schema: typeof schemaValue === 'string' ? schemaValue : null,
    };
}

function assertSchemaAllowed(schema: string | null, opts: SqlPolicyOptions, what: string): void {
    const effective = (schema ?? opts.defaultSchema).toLowerCase();
    if (!opts.allowedSchemas.has(effective)) {
        throw new SqlPolicyError(`Access to schema '${schema}' is not allowed (${what}).`);
    }
}

/** Generic, fail-closed walk over the whole AST (including subqueries and UNION branches via `_next`). */
function walkAst(node: unknown, opts: SqlPolicyOptions, seen: Set<object>): void {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
        for (const child of node) walkAst(child, opts, seen);
        return;
    }

    const n = node as Record<string, any>;

    if (n.type === 'function' || n.type === 'aggr_func') {
        const resolved = resolveFunctionName(n);
        if (!resolved) {
            throw new SqlPolicyError('Could not resolve a function name in the statement; refusing to run it.');
        }
        if (resolved.schema !== null) {
            assertSchemaAllowed(resolved.schema, opts, `function ${resolved.schema}.${resolved.name}`);
        }
        const upper = resolved.name.toUpperCase();
        if (opts.deniedFunctions.has(upper)) {
            throw new SqlPolicyError(`Function '${upper}' is not allowed.`);
        }
    }

    if (n.type === 'var') {
        throw new SqlPolicyError('User and system variables (@var, @@var) are not allowed.');
    }

    if (n.into && typeof n.into === 'object' && (n.into.keyword || n.into.expr)) {
        throw new SqlPolicyError('SELECT ... INTO (OUTFILE, DUMPFILE or variables) is not allowed.');
    }

    if (n.locking_read) {
        throw new SqlPolicyError(`Locking reads (${String(n.locking_read)}) are not allowed.`);
    }

    for (const [key, value] of Object.entries(n)) {
        if (key === 'loc') continue;
        walkAst(value, opts, seen);
    }
}

const tableParser = new Parser();

/**
 * Validates a parsed statement against the policy. Throws {@link SqlPolicyError} on any violation.
 *
 * @param sql   the original SQL text (used for the parser's table list)
 * @param ast   the single-statement AST produced by node-sql-parser
 */
export function enforceSqlPolicy(sql: string, ast: unknown, opts: SqlPolicyOptions): void {
    let tables: string[];
    try {
        tables = tableParser.tableList(sql, { database: 'MySQL' });
    } catch (e: any) {
        throw new SqlPolicyError(`Could not determine the tables referenced by the statement: ${e.message}`);
    }
    for (const entry of tables) {
        // Format: "<operation>::<schema|null>::<table>"
        const [, schema] = entry.split('::');
        const effectiveSchema = !schema || schema === 'null' ? null : schema;
        assertSchemaAllowed(effectiveSchema, opts, `table reference '${entry.split('::').slice(1).join('.')}'`);
    }

    walkAst(ast, opts, new Set());
}

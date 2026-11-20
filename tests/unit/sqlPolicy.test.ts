import { describe, it, expect, afterEach } from 'vitest';
import { injectLimitAst, validateExplainSelect, OptimizerError } from '../../src/db/optimizer';
import { getSqlPolicyOptions, isShowStatement, type SqlPolicyOptions } from '../../src/db/sqlPolicy';

const ENV_KEYS = ['DB_NAME', 'MCP_ALLOWED_SCHEMAS', 'MCP_ALLOW_SHOW', 'MCP_DENY_FUNCTIONS'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

function policy(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}): SqlPolicyOptions {
    process.env.DB_NAME = 'appdb';
    delete process.env.MCP_ALLOWED_SCHEMAS;
    delete process.env.MCP_ALLOW_SHOW;
    delete process.env.MCP_DENY_FUNCTIONS;
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    return getSqlPolicyOptions();
}

const run = (sql: string, p: SqlPolicyOptions = policy()) => injectLimitAst(sql, 500, p);

describe('SQL policy - evasion corpus (must be DENIED)', () => {
    const denied: Array<[string, RegExp]> = [
        // Server file system
        ["SELECT LOAD_FILE('/etc/passwd')", /LOAD_FILE/],
        ['select load_file(0x2f6574632f706173737764)', /LOAD_FILE/],
        ["SELECT id FROM users WHERE name = LOAD_FILE('/etc/hosts')", /LOAD_FILE/],
        ["SELECT * FROM users INTO OUTFILE '/tmp/out.csv'", /INTO/],
        ["SELECT * FROM users INTO DUMPFILE '/tmp/out.bin'", /INTO/],
        ['SELECT id INTO @v FROM users', /INTO|variables/],
        // Variables
        ['SELECT @@version', /variables/],
        ['SELECT @@global.secure_file_priv', /variables/],
        ['SELECT @x', /variables/],
        // System schemas (any case / quoting)
        ['SELECT * FROM information_schema.tables', /information_schema/],
        ['SELECT * FROM INFORMATION_SCHEMA.COLUMNS', /INFORMATION_SCHEMA/],
        ['SELECT * FROM `information_schema`.`columns`', /information_schema/],
        ['SELECT user, authentication_string FROM mysql.user', /mysql/],
        ['SELECT * FROM performance_schema.threads', /performance_schema/],
        ['SELECT * FROM sys.version', /sys/],
        // Other schemas, directly and nested
        ['SELECT * FROM otherdb.secrets', /otherdb/],
        ['SELECT id FROM users WHERE id IN (SELECT id FROM otherdb.secrets)', /otherdb/],
        ['SELECT id FROM users UNION SELECT user FROM mysql.user', /mysql/],
        ['SELECT * FROM (SELECT * FROM otherdb.secrets) d', /otherdb/],
        ['SELECT u.id FROM users u JOIN otherdb.secrets s ON s.id = u.id', /otherdb/],
        ['SELECT EXISTS (SELECT 1 FROM information_schema.tables)', /information_schema/],
        ["SELECT 1 UNION SELECT LOAD_FILE('/etc/passwd')", /LOAD_FILE/],
        // Timing, locks, environment disclosure
        ['SELECT SLEEP(5)', /SLEEP/],
        ["SELECT BENCHMARK(100000000, MD5('x'))", /BENCHMARK/],
        ["SELECT GET_LOCK('lock', 10)", /GET_LOCK/],
        ['SELECT USER()', /USER/],
        ['SELECT CURRENT_USER()', /CURRENT_USER/],
        ['SELECT DATABASE()', /DATABASE/],
        ['SELECT schema()', /SCHEMA/],
        ['SELECT VERSION()', /VERSION/],
        ['SELECT CONNECTION_ID()', /CONNECTION_ID/],
        ["SELECT sys_exec('id')", /SYS_EXEC/],
        // Schema-qualified functions outside the allowed schemas
        ['SELECT otherdb.fn(1)', /otherdb/],
        // Locking reads
        ['SELECT * FROM users FOR UPDATE', /Locking/],
        ['SELECT * FROM users LOCK IN SHARE MODE', /Locking/],
        // Executable comments (MySQL and MariaDB forms)
        ["SELECT /*!50000 LOAD_FILE('/etc/passwd') */", /Executable comments/],
        ['SELECT 1 /*! , @@version */', /Executable comments/],
        ['SELECT 1 /*M!100100 , @@version */', /Executable comments/],
        ['SELECT 1 /* ! spaced */', /Executable comments/],
        // SHOW in any disguise (disabled by default)
        ['SHOW GRANTS', /SHOW statements are disabled/],
        ['show databases', /SHOW statements are disabled/],
        ['/**/ SHOW TABLES', /SHOW statements are disabled/],
        ['-- comment\nSHOW CREATE TABLE users', /SHOW statements are disabled/],
        ['  \n\tSHOW PROCESSLIST', /SHOW statements are disabled/],
        // Stacked statements
        ['SELECT 1; SELECT 2', /Multiple statements/],
        // Obfuscation and placement variants
        ["SELECT `LOAD_FILE`('/etc/passwd')", /LOAD_FILE/],
        ["SELECT load_file/**/('/etc/passwd')", /LOAD_FILE/],
        ["(SELECT LOAD_FILE('/etc/passwd'))", /LOAD_FILE/],
        ['SELECT 1 FROM users WHERE EXTRACTVALUE(1, CONCAT(0x5c, (SELECT @@version)))', /variables/],
        ['SELECT * FROM information_schema . tables', /information_schema/],
        ['SELECT * FROM `mysql`.user', /mysql/],
        ['SELECT (SELECT authentication_string FROM mysql.user LIMIT 1) AS x', /mysql/],
        ['SELECT * FROM users ORDER BY (SELECT 1 FROM mysql.user LIMIT 1)', /mysql/],
        ['SELECT * FROM users GROUP BY id HAVING (SELECT COUNT(*) FROM mysql.user) > 0', /mysql/],
        ['WITH x AS (SELECT * FROM mysql.user) SELECT * FROM x', /mysql/],
        ['SELECT * FROM users WHERE id = 1 AND (SELECT 1 FROM (SELECT SLEEP(1)) x)', /SLEEP/],
        ['SELECT * FROM users WHERE id = 1 LIMIT 1 INTO @a', /INTO/],
        ["SELECT * FROM users WHERE id = 1 /*!UNION SELECT LOAD_FILE('/x')*/", /Executable comments/],
        ['SELECT current_role()', /CURRENT_ROLE/],
        // The policy also applies to writes
        ["UPDATE users SET name = LOAD_FILE('/etc/passwd') WHERE id = 1", /LOAD_FILE/],
        ['INSERT INTO otherdb.audit (id) VALUES (1)', /otherdb/],
        ['DELETE FROM mysql.user WHERE 1 = 1', /mysql/],
    ];

    it.each(denied)('%s', (sql, reason) => {
        expect(() => run(sql)).toThrow(OptimizerError);
        expect(() => run(sql)).toThrow(reason);
    });

    it.each([['DO SLEEP(1)'], ['HANDLER users OPEN'], ['TABLE users'], ['SELECT 1\0']])(
        'unparseable or unsupported syntax is rejected: %s',
        (sql) => {
            expect(() => run(sql)).toThrow(OptimizerError);
        },
    );

    it('denials carry the SQL_POLICY code', () => {
        try {
            run("SELECT LOAD_FILE('/etc/passwd')");
            expect.unreachable();
        } catch (e: any) {
            expect(e.code).toBe('SQL_POLICY');
        }
    });

    it('explain_query goes through the same policy', () => {
        expect(() => validateExplainSelect('SELECT * FROM information_schema.tables', 500)).toThrow(/information_schema/);
    });
});

describe('SQL policy - legitimate queries (must be ALLOWED)', () => {
    const allowed: string[] = [
        'SELECT * FROM users',
        'SELECT u.id, o.total FROM users u JOIN orders o ON o.user_id = u.id WHERE o.status = "paid"',
        'SELECT u.id FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE o.id IS NULL',
        'SELECT id FROM users UNION SELECT user_id FROM orders',
        'SELECT id FROM users UNION ALL SELECT user_id FROM orders',
        'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 100)',
        'SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)',
        'SELECT d.c FROM (SELECT COUNT(*) AS c FROM orders) d',
        'SELECT status, COUNT(*), SUM(total), AVG(total), MIN(created_at), MAX(created_at) FROM orders GROUP BY status HAVING COUNT(*) > 1',
        "SELECT DATE_FORMAT(created_at, '%Y-%m'), DATE(created_at), YEAR(created_at), NOW(), CURDATE() FROM orders",
        "SELECT DATE_ADD(created_at, INTERVAL 7 DAY), DATEDIFF(NOW(), created_at), TIMESTAMPDIFF(DAY, created_at, NOW()) FROM orders",
        "SELECT UPPER(name), LOWER(email), TRIM(name), CONCAT(name, ' <', email, '>'), SUBSTRING(email, 1, 3), LENGTH(name), REPLACE(name, 'a', 'b') FROM users",
        "SELECT CASE WHEN total > 100 THEN 'big' ELSE 'small' END, COALESCE(note, '-'), IFNULL(note, ''), IF(total > 0, 1, 0), NULLIF(total, 0) FROM orders",
        'SELECT CAST(total AS CHAR), CONVERT(total, CHAR), ROUND(total, 2), FLOOR(total), ABS(total) FROM orders',
        "SELECT * FROM users WHERE name LIKE 'A%' AND id BETWEEN 1 AND 100 ORDER BY name DESC LIMIT 10 OFFSET 20",
        "SELECT JSON_EXTRACT(payload, '$.id') FROM events",
        'SELECT GROUP_CONCAT(name ORDER BY name SEPARATOR ", ") FROM users',
        'WITH big AS (SELECT * FROM orders WHERE total > 100) SELECT COUNT(*) FROM big',
        'SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS rn FROM orders',
        'SELECT * FROM appdb.users',
        'SELECT * FROM `APPDB`.`users`',
        'SELECT MD5(email), SHA2(email, 256) FROM users',
        "SELECT /* explanatory comment */ id FROM users -- trailing comment",
        // Aliases that merely look like system schema names are fine
        'SELECT * FROM users AS mysql',
        'SELECT mysql.id FROM users mysql',
        'SELECT CHAR(76, 79, 65, 68)',
    ];

    it.each(allowed.map((s) => [s]))('%s', (sql) => {
        const result = run(sql);
        expect(result.astType).toBe('select');
        expect(result.sql.toUpperCase()).toContain('LIMIT');
    });
});

describe('SQL policy - configuration', () => {
    it('MCP_ALLOWED_SCHEMAS opens additional schemas (case-insensitive)', () => {
        const p = policy({ MCP_ALLOWED_SCHEMAS: 'appdb, Reporting' });
        expect(run('SELECT * FROM reporting.daily', p).astType).toBe('select');
        expect(() => run('SELECT * FROM otherdb.t', p)).toThrow(/otherdb/);
    });

    it('the default schema is always allowed even if not listed', () => {
        const p = policy({ MCP_ALLOWED_SCHEMAS: 'reporting' });
        expect(run('SELECT * FROM users', p).astType).toBe('select');
    });

    it('system schemas are reachable only when explicitly listed', () => {
        const p = policy({ MCP_ALLOWED_SCHEMAS: 'appdb,information_schema' });
        expect(run('SELECT table_name FROM information_schema.tables', p).astType).toBe('select');
    });

    it('MCP_DENY_FUNCTIONS adds functions to the denylist', () => {
        const p = policy({ MCP_DENY_FUNCTIONS: 'md5, sha2' });
        expect(() => run('SELECT MD5(email) FROM users', p)).toThrow(/MD5/);
        expect(() => run('SELECT SHA2(email, 256) FROM users', p)).toThrow(/SHA2/);
    });

    it('MCP_ALLOW_SHOW=true restores SHOW statements', () => {
        const p = policy({ MCP_ALLOW_SHOW: 'true' });
        expect(run('SHOW TABLES', p).astType).toBe('show');
        expect(run('/**/ SHOW TABLES', p).astType).toBe('show');
    });
});

describe('isShowStatement', () => {
    it.each([
        ['SHOW TABLES', true],
        ['  show databases', true],
        ['/* x */ SHOW GRANTS', true],
        ['-- c\n# d\nSHOW STATUS', true],
        ['SELECT 1', false],
        ['SELECT show_count FROM t', false],
    ])('%j → %s', (sql, expected) => {
        expect(isShowStatement(sql)).toBe(expected);
    });
});

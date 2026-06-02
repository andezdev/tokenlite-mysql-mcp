import { buildSchemaGraph, schemaGraph } from '../src/db/schema.js';
import { pool } from '../src/db/index.js';

async function runInspection() {
    console.log('============================================================');
    console.log('🔎 IN-MEMORY RELATIONAL SCHEMA GRAPH INSPECTION TOOL');
    console.log('============================================================\n');

    try {
        console.log('⚡ Connecting to database and building schema graph...');
        await buildSchemaGraph();
        console.log('✅ Graph built successfully.\n');

        if (schemaGraph.size === 0) {
            console.error('❌ Error: Schema graph is empty. Please check your database connection/credentials in .env.');
            process.exit(1);
        }

        const tableNames = Array.from(schemaGraph.keys());
        let totalExplicit = 0;
        let totalHeuristic = 0;
        let danglingRefsCount = 0;
        const danglingRefs: Array<{ fromTable: string; column: string; toTable: string; type: string }> = [];

        // Build child references for all tables
        const childRelations = new Map<string, Array<{ childTable: string; columnName: string; isHeuristic: boolean }>>();
        for (const tableName of tableNames) {
            childRelations.set(tableName, []);
        }

        for (const [tableName, node] of schemaGraph.entries()) {
            for (const fk of node.foreignKeys) {
                const list = childRelations.get(fk.referencedTable);
                if (list) {
                    list.push({
                        childTable: tableName,
                        columnName: fk.columnName,
                        isHeuristic: fk.isHeuristic
                    });
                }
            }
        }

        for (const [tableName, node] of schemaGraph.entries()) {
            console.log(`📋 Table: \x1b[1m\x1b[36m${tableName}\x1b[0m`);
            
            console.log('  └─ Outgoing Relations (Foreign Keys):');
            if (node.foreignKeys.length === 0) {
                console.log('     (None)');
            } else {
                for (const fk of node.foreignKeys) {
                    const isTargetValid = schemaGraph.has(fk.referencedTable);
                    const statusStr = isTargetValid 
                        ? '✅' 
                        : '❌ [DANGLING REFERENCED TABLE]';
                    
                    if (!isTargetValid) {
                        danglingRefsCount++;
                        danglingRefs.push({
                            fromTable: tableName,
                            column: fk.columnName,
                            toTable: fk.referencedTable,
                            type: fk.isHeuristic ? 'Heuristic' : 'Explicit'
                        });
                    }

                    if (fk.isHeuristic) {
                        totalHeuristic++;
                        const confStr = fk.confidence != null ? ` \x1b[2m(confidence: ${fk.confidence})\x1b[0m` : '';
                        console.log(
                            `     • \x1b[33m[HEURISTIC]\x1b[0m \x1b[32m${fk.columnName}\x1b[0m ➔ \x1b[1m${fk.referencedTable}\x1b[0m.\x1b[2m${fk.referencedColumn}\x1b[0m${confStr} ${statusStr}`
                        );
                    } else {
                        totalExplicit++;
                        console.log(
                            `     • \x1b[34m[EXPLICIT] \x1b[0m \x1b[32m${fk.columnName}\x1b[0m ➔ \x1b[1m${fk.referencedTable}\x1b[0m.\x1b[2m${fk.referencedColumn}\x1b[0m ${statusStr}`
                        );
                    }
                }
            }

            // Incoming Relations (Child Tables pointing here)
            console.log('  └─ Incoming Relations (Back-References):');
            const incoming = childRelations.get(tableName) || [];
            if (incoming.length === 0) {
                console.log('     (None)');
            } else {
                for (const child of incoming) {
                    const typeTag = child.isHeuristic 
                        ? '\x1b[33m[HEURISTIC]\x1b[0m' 
                        : '\x1b[34m[EXPLICIT] \x1b[0m';
                    console.log(
                        `     • ${typeTag} \x1b[1m${child.childTable}\x1b[0m.\x1b[32m${child.columnName}\x1b[0m ➔ \x1b[2mthis\x1b[0m`
                    );
                }
            }
            console.log('');
        }

        console.log('============================================================');
        console.log('📊 GRAPH HEALTH & STATISTICS SUMMARY');
        console.log('============================================================');
        console.log(`• Total Tables Indexed         : ${tableNames.length}`);
        console.log(`• Total Explicit Foreign Keys  : \x1b[34m${totalExplicit}\x1b[0m`);
        console.log(`• Total Heuristic Deductions   : \x1b[33m${totalHeuristic}\x1b[0m`);
        
        const totalKeys = totalExplicit + totalHeuristic;
        const heuristicRatio = totalKeys > 0 ? ((totalHeuristic / totalKeys) * 100).toFixed(1) : '0';
        console.log(`• Heuristic Coverage Ratio     : ${heuristicRatio}%`);

        if (danglingRefsCount > 0) {
            console.log(`\n❌ \x1b[31mINTEGRITY CHECK: FAILED (${danglingRefsCount} dangling reference(s) found)\x1b[0m`);
            for (const d of danglingRefs) {
                console.log(
                    `  ⚠️  ${d.type} reference from \x1b[1m${d.fromTable}.${d.column}\x1b[0m points to non-existent table \x1b[31m"${d.toTable}"\x1b[0m`
                );
            }
            process.exitCode = 1;
        } else {
            console.log('\n✅ \x1b[32mINTEGRITY CHECK: PASSED (All foreign keys point to valid tables)\x1b[0m');
        }
        console.log('============================================================\n');

    } catch (error) {
        console.error('❌ An unexpected error occurred during inspection:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

runInspection();

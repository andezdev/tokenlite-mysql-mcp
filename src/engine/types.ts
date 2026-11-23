export interface ForeignKey {
    columnName: string;
    referencedTable: string;
    referencedColumn: string;
    isHeuristic: boolean;
    confidence?: number;
}

export interface TableNode {
    name: string;
    /** 'view' for SQL views (MCP_INCLUDE_VIEWS, on by default). Defaults to 'table' when omitted. */
    kind?: 'table' | 'view';
    foreignKeys: ForeignKey[];
}

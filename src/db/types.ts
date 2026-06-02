export interface ForeignKey {
    columnName: string;
    referencedTable: string;
    referencedColumn: string;
    isHeuristic: boolean;
    confidence?: number;
}

export interface TableNode {
    name: string;
    foreignKeys: ForeignKey[];
}

export interface ForeignKey {
    columnName: string;
    referencedTable: string;
    referencedColumn: string;
    isHeuristic: boolean;
}

export interface TableNode {
    name: string;
    foreignKeys: ForeignKey[];
}

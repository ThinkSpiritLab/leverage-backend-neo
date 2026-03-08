export declare enum ProblemStatus {
    PENDING = 0,
    ACCEPTED = 1,
    REJECTED = 2
}
export declare class Problem {
    id: number;
    prefix: string;
    logicId: number;
    title: string;
    content: string;
    source: string;
    timeLimit: number;
    memoryLimit: number;
    difficulty: number;
    cases: number;
    multiCases: boolean;
    submits: number;
    accepts: number;
    restricted: boolean;
    status: ProblemStatus;
    statusUpdatedAt: Date;
    closed: boolean;
    createrId: number;
    creater: any;
    tags: any[];
    spjId: number;
    spj: any | null;
    createdAt: Date;
    updatedAt: Date;
}

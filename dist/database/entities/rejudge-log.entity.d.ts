export declare class RejudgeLog {
    id: number;
    submissionId: number;
    submission: any;
    status: number;
    judger: string | null;
    time: number;
    memory: number;
    judgeResult?: string;
    compileErrorMsg?: string;
    submittedAt: Date;
    createdAt: Date;
}

export declare class Submission {
    id: number;
    userId: number;
    user: any;
    problemId: number;
    problem: any;
    language: number;
    time: number;
    memory: number;
    misc: any;
    sus?: any;
    status: number;
    judger: string | null;
    courseId: number | null;
    course: any;
    contestId: number | null;
    contest: any;
    rejudgeLogs: any[];
    createdAt: Date;
    updatedAt: Date;
}

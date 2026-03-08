export declare class CourseUser {
    courseId: number;
    course: any;
    userId: number;
    user: any;
    courseClass: string | null;
    submits: number;
    accepts: number;
    bannedUntil: Date | null;
    bannedReason: string | null;
    ip: string | null;
    createdAt: Date;
    updatedAt: Date;
}

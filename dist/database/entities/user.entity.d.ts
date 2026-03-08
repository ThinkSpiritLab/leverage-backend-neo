export type Authority = 'user' | 'admin' | 'superadmin' | string;
export type Certification = string;
export declare class User {
    id: number;
    username: string;
    passwordHash: string;
    nickname: string | null;
    sex: string;
    authority: Authority;
    submits: number;
    rank: number;
    status: number;
    statusEndsAt: Date;
    remarks: string;
    accepts: number;
    certifiedName: string | null;
    certifyType: Certification | null;
    grade: string | null;
    college: string | null;
    profession: string | null;
    class: string | null;
    shadowed: number;
    createdAt: Date;
    updatedAt: Date;
    metas: any[];
}

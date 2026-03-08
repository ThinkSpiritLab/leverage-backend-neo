export declare class Contest {
    id: number;
    allowDirectLogin: boolean;
    deviceBindType: number;
    consultantId: number;
    consultant: any;
    name: string;
    description: string;
    notification: string;
    registrationEndTime: Date | null;
    startTime: Date;
    endTime: Date;
    penalty: number;
    public: boolean;
    scoreByPoint: boolean;
    openForRegistration: boolean;
    fullyFreeze: boolean;
    freezeTime: number;
    freezeTimeAfterEnd: number;
    enabledLanguageJSON: string | null;
    createdAt: Date;
    updatedAt: Date;
}

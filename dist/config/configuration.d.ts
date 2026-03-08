declare const _default: () => {
    port: number;
    skipInit: boolean;
    database: {
        host: string;
        port: number;
        database: string | undefined;
        username: string | undefined;
        password: string | undefined;
    };
    redis: {
        host: string;
        port: number;
    };
    jwt: {
        accessSecret: string | undefined;
        refreshSecret: string | undefined;
        accessExpiresIn: string;
        refreshExpiresIn: string;
    };
    heng: {
        baseUrl: string | undefined;
        ak: string | undefined;
        sk: string | undefined;
        allowInsecureTls: boolean;
    };
    submission: {
        maxPerMinute: number;
    };
};
export default _default;

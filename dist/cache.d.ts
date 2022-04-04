export default class Cache {
    redis: any;
    redisHost: string;
    redisPort: number;
    redisTimeout: number;
    log: any;
    constructor(fnLog: any);
    init(): Promise<void>;
    shutdown(): Promise<void>;
    set(key: string, value: string, expireMS?: number): Promise<void>;
    get(key: string): Promise<string | null>;
    deleteKey(key: string): Promise<void>;
    deletePattern(pattern: string): Promise<void>;
    private search;
}

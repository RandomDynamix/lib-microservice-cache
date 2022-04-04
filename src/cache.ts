import Redis from 'ioredis';

const DEFAULT_TIMEOUT: number = 60000; //1 Minute - for security puposes

export default class Cache {
    redis: any = null;
    redisHost: string    = process.env.REDIS_HOST || '127.0.0.1';
    redisPort: number    = parseInt(process.env.REDIS_PORT || '6379');
    redisTimeout: number = parseInt(process.env.REDIS_TIMEOUT || '250'); //250 milliseconds (command timeout)
    log: any             = null;

    constructor(fnLog: any) {
        this.log = fnLog;
    }

    async init(): Promise<void> {
        this.redis = new Redis({
            port: this.redisPort,
            host: this.redisHost,
            lazyConnect: true,
            commandTimeout: this.redisTimeout,
            enableOfflineQueue: false,
            autoResendUnfulfilledCommands: false,
            maxRetriesPerRequest: 0,
            retryStrategy(times: number): number | void | null {
                const delay = Math.min(times * 1000, 10000);
                return delay;
            },
            reconnectOnError(error: Error): boolean | 1 | 2 {
                if(error.message.includes('READONLY')) return true;
                return false;
            }
        });

        this.redis.on('error', (err: any) => {
            try{this.log('error', 'CACHE', `Cache ERROR Event: ${JSON.stringify(err)}`);}catch(err){}
        });
        this.redis.on('reconnecting', (delay: any) => {
            try{this.log('info', 'CACHE', `Cache RECONNECT: ${delay}ms`);}catch(err){}
        });
        this.redis.on('end', () => {
            try{this.log('info', 'CACHE', `Cache CONNECTION END`);}catch(err){}
        });

        await this.redis.connect();
        //TODO this.log("info", "SERVICE", "REDIS Cache Connected and Ready at (" + this.redisHost + ":" + this.redisPort + ")");
    }

    async shutdown(): Promise<void> {
        try {
            this.redis.disconnect();
        } catch(err) {
            try{this.log('error', 'CACHE', `Cache SHUTDOWN Error: ${JSON.stringify(err)}`);}catch(err){}
        }
    }

    async set(key: string, value: string, expireMS: number = DEFAULT_TIMEOUT): Promise<void> {
        let cacheStart: number = Date.now();
            await this.redis.set(key, value, 'PX', expireMS);
        try{this.log('info', 'CACHE', ` setKey (${key}) Duration: ${Date.now() - cacheStart}ms`);}catch(err){}
    }

    async get(key: string): Promise<string | null> {
        let cacheStart: number = Date.now();
            let value: string = await this.redis.get(key);
        try{this.log('info', 'CACHE', `getKey (${key}) Duration: ${Date.now() - cacheStart}ms`);}catch(err){}
        return value;
    }

    async deleteKey(key: string): Promise<void> {
        let cacheStart: number = Date.now();
            await this.redis.del(key);
        try{this.log('info', 'CACHE', `deleteKey (${key}) Duration: ${Date.now() - cacheStart}ms`);}catch(err){}
    }

    async deletePattern(pattern: string): Promise<void> {
        let cacheStart: number = Date.now();

        //Find all Matching Keys
        let matchingKeys: string[] = await this.search(pattern);
        if(!matchingKeys) {
            try{this.log('info', 'CACHE', `No CACHE Keys Found matching: ${pattern}`);}catch(err){}
        } else {
            //Purge Each Key
            try{this.log('info', 'CACHE', `DELETING ${matchingKeys.length} Keys for Pattern: ${pattern}`);}catch(err){}
            for(let key of matchingKeys) {
                await this.deleteKey(key);
            }
        }
        try{this.log('info', 'CACHE', `deletePattern (${pattern}) Duration: ${Date.now() - cacheStart}ms`);}catch(err){}
    }

    private async search(pattern: string): Promise<string[]> {
        let cacheStart: number = Date.now();

        let matchingKeys: string[] = [];
        let cursor: any = '0';
        do {
            let scanResult: any = await this.redis.scan(cursor, 'MATCH', `*${pattern}*`, 'COUNT', '10');
            cursor = scanResult[0];
            if(scanResult[1] && scanResult[1].length && scanResult.length > 0) matchingKeys = matchingKeys.concat(scanResult[1]);
        } while(cursor !== '0');
        try{this.log('info', 'CACHE', `scan (${pattern}) Duration: ${Date.now() - cacheStart}ms`);}catch(err){}

        return matchingKeys;
    }
}
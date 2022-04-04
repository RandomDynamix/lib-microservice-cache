import Redis from 'ioredis';
const DEFAULT_TIMEOUT = 60000;
export default class Cache {
    constructor(fnLog) {
        this.redis = null;
        this.redisHost = process.env.REDIS_HOST || '127.0.0.1';
        this.redisPort = parseInt(process.env.REDIS_PORT || '6379');
        this.redisTimeout = parseInt(process.env.REDIS_TIMEOUT || '250');
        this.log = null;
        this.log = fnLog;
    }
    async init() {
        this.redis = new Redis({
            port: this.redisPort,
            host: this.redisHost,
            lazyConnect: true,
            commandTimeout: this.redisTimeout,
            enableOfflineQueue: false,
            autoResendUnfulfilledCommands: false,
            maxRetriesPerRequest: 0,
            retryStrategy(times) {
                const delay = Math.min(times * 1000, 10000);
                return delay;
            },
            reconnectOnError(error) {
                if (error.message.includes('READONLY'))
                    return true;
                return false;
            }
        });
        this.redis.on('error', (err) => {
            try {
                this.log('error', 'CACHE', `Cache ERROR Event: ${JSON.stringify(err)}`);
            }
            catch (err) { }
        });
        this.redis.on('reconnecting', (delay) => {
            try {
                this.log('info', 'CACHE', `Cache RECONNECT: ${delay}ms`);
            }
            catch (err) { }
        });
        this.redis.on('end', () => {
            try {
                this.log('info', 'CACHE', `Cache CONNECTION END`);
            }
            catch (err) { }
        });
        await this.redis.connect();
    }
    async shutdown() {
        try {
            this.redis.disconnect();
        }
        catch (err) {
            try {
                this.log('error', 'CACHE', `Cache SHUTDOWN Error: ${JSON.stringify(err)}`);
            }
            catch (err) { }
        }
    }
    async set(key, value, expireMS = DEFAULT_TIMEOUT) {
        let cacheStart = Date.now();
        await this.redis.set(key, value, 'PX', expireMS);
        try {
            this.log('info', 'CACHE', ` setKey (${key}) Duration: ${Date.now() - cacheStart}ms`);
        }
        catch (err) { }
    }
    async get(key) {
        let cacheStart = Date.now();
        let value = await this.redis.get(key);
        try {
            this.log('info', 'CACHE', `getKey (${key}) Duration: ${Date.now() - cacheStart}ms`);
        }
        catch (err) { }
        return value;
    }
    async deleteKey(key) {
        let cacheStart = Date.now();
        await this.redis.del(key);
        try {
            this.log('info', 'CACHE', `deleteKey (${key}) Duration: ${Date.now() - cacheStart}ms`);
        }
        catch (err) { }
    }
    async deletePattern(pattern) {
        let cacheStart = Date.now();
        let matchingKeys = await this.search(pattern);
        if (!matchingKeys) {
            try {
                this.log('info', 'CACHE', `No CACHE Keys Found matching: ${pattern}`);
            }
            catch (err) { }
        }
        else {
            try {
                this.log('info', 'CACHE', `DELETING ${matchingKeys.length} Keys for Pattern: ${pattern}`);
            }
            catch (err) { }
            for (let key of matchingKeys) {
                await this.deleteKey(key);
            }
        }
        try {
            this.log('info', 'CACHE', `deletePattern (${pattern}) Duration: ${Date.now() - cacheStart}ms`);
        }
        catch (err) { }
    }
    async search(pattern) {
        let cacheStart = Date.now();
        let matchingKeys = [];
        let cursor = '0';
        do {
            let scanResult = await this.redis.scan(cursor, 'MATCH', `*${pattern}*`, 'COUNT', '10');
            cursor = scanResult[0];
            if (scanResult[1] && scanResult[1].length && scanResult.length > 0)
                matchingKeys = matchingKeys.concat(scanResult[1]);
        } while (cursor !== '0');
        try {
            this.log('info', 'CACHE', `scan (${pattern}) Duration: ${Date.now() - cacheStart}ms`);
        }
        catch (err) { }
        return matchingKeys;
    }
}

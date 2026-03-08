"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    config;
    logger = new common_1.Logger(RedisService_1.name);
    client;
    constructor(config) {
        this.config = config;
    }
    async onModuleInit() {
        this.client = new ioredis_1.default({
            host: this.config.get('redis.host', 'localhost'),
            port: this.config.get('redis.port', 6379),
            lazyConnect: true,
        });
        await this.client.connect();
        this.logger.log('RedisService connected');
    }
    async onModuleDestroy() {
        await this.client.quit();
    }
    getClient() {
        return this.client;
    }
    async get(key) {
        return this.client.get(key);
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds) {
            await this.client.setex(key, ttlSeconds, String(value));
        }
        else {
            await this.client.set(key, String(value));
        }
    }
    async del(...keys) {
        return this.client.del(...keys);
    }
    async incr(key) {
        return this.client.incr(key);
    }
    async incrby(key, increment) {
        return this.client.incrby(key, increment);
    }
    async expire(key, ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
    }
    async ttl(key) {
        return this.client.ttl(key);
    }
    async exists(...keys) {
        return this.client.exists(...keys);
    }
    async keys(pattern) {
        return this.client.keys(pattern);
    }
    async sadd(key, ...members) {
        return this.client.sadd(key, ...members);
    }
    async smembers(key) {
        return this.client.smembers(key);
    }
    async srem(key, ...members) {
        return this.client.srem(key, ...members);
    }
    async sismember(key, member) {
        return this.client.sismember(key, member);
    }
    async scard(key) {
        return this.client.scard(key);
    }
    async hget(key, field) {
        return this.client.hget(key, field);
    }
    async hset(key, field, value) {
        return this.client.hset(key, field, String(value));
    }
    async hmset(key, data) {
        await this.client.hmset(key, data);
    }
    async hgetall(key) {
        return this.client.hgetall(key);
    }
    async hdel(key, ...fields) {
        return this.client.hdel(key, ...fields);
    }
    async zadd(key, score, member) {
        return this.client.zadd(key, score, member);
    }
    async zaddMany(key, members) {
        if (members.length === 0)
            return 0;
        const args = [];
        for (const { score, member } of members) {
            args.push(score, member);
        }
        return this.client.zadd(key, ...args);
    }
    async zincrby(key, increment, member) {
        return this.client.zincrby(key, increment, member);
    }
    async zrank(key, member) {
        return this.client.zrank(key, member);
    }
    async zrevrank(key, member) {
        return this.client.zrevrank(key, member);
    }
    async zscore(key, member) {
        return this.client.zscore(key, member);
    }
    async zrangebyscore(key, min, max) {
        return this.client.zrangebyscore(key, min, max);
    }
    async zrevrangebyscore(key, max, min) {
        return this.client.zrevrangebyscore(key, max, min);
    }
    async zrange(key, start, stop) {
        return this.client.zrange(key, start, stop);
    }
    async zrevrange(key, start, stop) {
        return this.client.zrevrange(key, start, stop);
    }
    async zcard(key) {
        return this.client.zcard(key);
    }
    async zrem(key, ...members) {
        return this.client.zrem(key, ...members);
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map
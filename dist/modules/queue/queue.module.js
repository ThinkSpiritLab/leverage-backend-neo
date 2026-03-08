"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nestjs_1 = require("@bull-board/nestjs");
const bullAdapter_1 = require("@bull-board/api/bullAdapter");
const express_1 = require("@bull-board/express");
const queue_constants_1 = require("./queue.constants");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bull_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    redis: {
                        host: config.get('redis.host', 'localhost'),
                        port: config.get('redis.port', 6379),
                    },
                }),
            }),
            bull_1.BullModule.registerQueue({ name: queue_constants_1.JUDGE_TX_QUEUE }, { name: queue_constants_1.JUDGE_RX_QUEUE }),
            nestjs_1.BullBoardModule.forRoot({
                route: '/admin/queues',
                adapter: express_1.ExpressAdapter,
            }),
            nestjs_1.BullBoardModule.forFeature({ name: queue_constants_1.JUDGE_TX_QUEUE, adapter: bullAdapter_1.BullAdapter }, { name: queue_constants_1.JUDGE_RX_QUEUE, adapter: bullAdapter_1.BullAdapter }),
        ],
        exports: [bull_1.BullModule],
    })
], QueueModule);
//# sourceMappingURL=queue.module.js.map
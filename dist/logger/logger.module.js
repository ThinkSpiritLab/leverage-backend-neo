"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nestjs_pino_1 = require("nestjs-pino");
let LoggerModule = class LoggerModule {
};
exports.LoggerModule = LoggerModule;
exports.LoggerModule = LoggerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nestjs_pino_1.LoggerModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const isProduction = process.env.NODE_ENV === 'production';
                    return {
                        pinoHttp: {
                            level: isProduction ? 'info' : 'debug',
                            ...(isProduction
                                ? {}
                                : {
                                    transport: {
                                        target: 'pino-pretty',
                                        options: {
                                            colorize: true,
                                            singleLine: false,
                                            translateTime: 'HH:MM:ss',
                                            ignore: 'pid,hostname',
                                        },
                                    },
                                }),
                            autoLogging: {
                                ignore: (req) => req.url === '/health',
                            },
                            serializers: {
                                req(req) {
                                    return {
                                        method: req.method,
                                        url: req.url,
                                        remoteAddress: req.remoteAddress,
                                    };
                                },
                            },
                        },
                    };
                },
            }),
        ],
    })
], LoggerModule);
//# sourceMappingURL=logger.module.js.map
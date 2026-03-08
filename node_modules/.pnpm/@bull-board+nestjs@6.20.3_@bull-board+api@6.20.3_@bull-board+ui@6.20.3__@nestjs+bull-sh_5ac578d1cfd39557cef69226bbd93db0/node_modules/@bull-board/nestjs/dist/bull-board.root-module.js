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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BullBoardRootModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullBoardRootModule = void 0;
const common_1 = require("@nestjs/common");
const api_1 = require("@bull-board/api");
const bull_board_constants_1 = require("./bull-board.constants");
const core_1 = require("@nestjs/core");
const bull_board_util_1 = require("./bull-board.util");
let BullBoardRootModule = BullBoardRootModule_1 = class BullBoardRootModule {
    constructor(adapterHost, applicationConfig, adapter, options) {
        this.adapterHost = adapterHost;
        this.applicationConfig = applicationConfig;
        this.adapter = adapter;
        this.options = options;
    }
    configure(consumer) {
        const addForwardSlash = (path) => {
            return path.startsWith('/') || path === '' ? path : `/${path}`;
        };
        const shouldBypassGlobalPrefix = () => {
            const prefixOptions = this.applicationConfig.getGlobalPrefixOptions();
            if (!(prefixOptions === null || prefixOptions === void 0 ? void 0 : prefixOptions.exclude))
                return false;
            return prefixOptions.exclude.some(exclusion => {
                const routePath = addForwardSlash(this.options.route);
                return exclusion.pathRegex.test(routePath);
            });
        };
        const prefix = shouldBypassGlobalPrefix()
            ? addForwardSlash(this.options.route)
            : addForwardSlash(this.applicationConfig.getGlobalPrefix() + this.options.route);
        this.adapter.setBasePath(prefix);
        if ((0, bull_board_util_1.isExpressAdapter)(this.adapter)) {
            return consumer
                .apply(this.options.middleware, this.adapter.getRouter())
                .forRoutes(this.options.route);
        }
        if ((0, bull_board_util_1.isFastifyAdapter)(this.adapter)) {
            this.adapterHost.httpAdapter
                .getInstance()
                .register(this.adapter.registerPlugin(), { prefix });
            return consumer
                .apply(this.options.middleware)
                .forRoutes(this.options.route);
        }
    }
    static forRoot(options) {
        const serverAdapter = new options.adapter();
        const bullBoardProvider = {
            provide: bull_board_constants_1.BULL_BOARD_INSTANCE,
            useFactory: () => (0, api_1.createBullBoard)({
                queues: [],
                serverAdapter: serverAdapter,
                options: options.boardOptions,
            })
        };
        const serverAdapterProvider = {
            provide: bull_board_constants_1.BULL_BOARD_ADAPTER,
            useFactory: () => serverAdapter
        };
        const optionsProvider = {
            provide: bull_board_constants_1.BULL_BOARD_OPTIONS,
            useValue: options
        };
        return {
            module: BullBoardRootModule_1,
            global: true,
            imports: [],
            providers: [
                serverAdapterProvider,
                optionsProvider,
                bullBoardProvider
            ],
            exports: [
                serverAdapterProvider,
                bullBoardProvider,
                optionsProvider
            ],
        };
    }
    static forRootAsync(options) {
        const bullBoardProvider = {
            provide: bull_board_constants_1.BULL_BOARD_INSTANCE,
            useFactory: (options, adapter) => (0, api_1.createBullBoard)({
                queues: [],
                serverAdapter: adapter,
                options: options.boardOptions,
            }),
            inject: [bull_board_constants_1.BULL_BOARD_OPTIONS, bull_board_constants_1.BULL_BOARD_ADAPTER]
        };
        const serverAdapterProvider = {
            provide: bull_board_constants_1.BULL_BOARD_ADAPTER,
            useFactory: (options) => new options.adapter(),
            inject: [bull_board_constants_1.BULL_BOARD_OPTIONS]
        };
        const optionsProvider = {
            provide: bull_board_constants_1.BULL_BOARD_OPTIONS,
            useFactory: options.useFactory,
            inject: options.inject
        };
        return {
            module: BullBoardRootModule_1,
            global: true,
            imports: options.imports,
            providers: [
                serverAdapterProvider,
                optionsProvider,
                bullBoardProvider
            ],
            exports: [
                serverAdapterProvider,
                bullBoardProvider,
                optionsProvider
            ],
        };
    }
};
exports.BullBoardRootModule = BullBoardRootModule;
exports.BullBoardRootModule = BullBoardRootModule = BullBoardRootModule_1 = __decorate([
    (0, common_1.Module)({}),
    __param(2, (0, common_1.Inject)(bull_board_constants_1.BULL_BOARD_ADAPTER)),
    __param(3, (0, common_1.Inject)(bull_board_constants_1.BULL_BOARD_OPTIONS)),
    __metadata("design:paramtypes", [core_1.HttpAdapterHost,
        core_1.ApplicationConfig, Object, Object])
], BullBoardRootModule);

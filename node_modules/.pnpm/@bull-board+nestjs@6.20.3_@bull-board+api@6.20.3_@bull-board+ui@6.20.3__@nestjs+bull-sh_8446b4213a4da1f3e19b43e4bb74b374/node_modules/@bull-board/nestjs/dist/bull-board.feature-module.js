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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullBoardFeatureModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const bull_shared_1 = require("@nestjs/bull-shared");
const bull_board_constants_1 = require("./bull-board.constants");
let BullBoardFeatureModule = class BullBoardFeatureModule {
    constructor(moduleRef, queues, board) {
        this.moduleRef = moduleRef;
        this.queues = queues;
        this.board = board;
    }
    onModuleInit() {
        for (const queueOption of this.queues) {
            const queue = this.moduleRef.get((0, bull_shared_1.getQueueToken)(queueOption.name), { strict: false });
            const queueAdapter = new queueOption.adapter(queue, queueOption.options);
            this.board.addQueue(queueAdapter);
        }
    }
};
exports.BullBoardFeatureModule = BullBoardFeatureModule;
exports.BullBoardFeatureModule = BullBoardFeatureModule = __decorate([
    (0, common_1.Module)({}),
    __param(1, (0, common_1.Inject)(bull_board_constants_1.BULL_BOARD_QUEUES)),
    __param(2, (0, common_1.Inject)(bull_board_constants_1.BULL_BOARD_INSTANCE)),
    __metadata("design:paramtypes", [core_1.ModuleRef, Array, Object])
], BullBoardFeatureModule);

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BullBoardModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullBoardModule = void 0;
const common_1 = require("@nestjs/common");
const bull_board_feature_module_1 = require("./bull-board.feature-module");
const bull_board_root_module_1 = require("./bull-board.root-module");
const bull_board_constants_1 = require("./bull-board.constants");
let BullBoardModule = BullBoardModule_1 = class BullBoardModule {
    static forFeature(...queues) {
        return {
            module: bull_board_feature_module_1.BullBoardFeatureModule,
            providers: [
                {
                    provide: bull_board_constants_1.BULL_BOARD_QUEUES,
                    useValue: queues
                }
            ]
        };
    }
    static forRoot(options) {
        return {
            module: BullBoardModule_1,
            imports: [bull_board_root_module_1.BullBoardRootModule.forRoot(options)],
            exports: [bull_board_root_module_1.BullBoardRootModule],
        };
    }
    static forRootAsync(options) {
        return {
            module: BullBoardModule_1,
            imports: [bull_board_root_module_1.BullBoardRootModule.forRootAsync(options)],
            exports: [bull_board_root_module_1.BullBoardRootModule]
        };
    }
};
exports.BullBoardModule = BullBoardModule;
exports.BullBoardModule = BullBoardModule = BullBoardModule_1 = __decorate([
    (0, common_1.Module)({})
], BullBoardModule);

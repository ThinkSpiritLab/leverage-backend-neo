"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InjectBullBoard = void 0;
const common_1 = require("@nestjs/common");
const bull_board_constants_1 = require("./bull-board.constants");
const InjectBullBoard = () => (0, common_1.Inject)(bull_board_constants_1.BULL_BOARD_INSTANCE);
exports.InjectBullBoard = InjectBullBoard;

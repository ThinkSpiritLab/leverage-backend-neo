import { BullBoardExpressAdapter, BullBoardFastifyAdapter, BullBoardServerAdapter } from "./bull-board.types";
export declare const isFastifyAdapter: (adapter: BullBoardServerAdapter) => adapter is BullBoardFastifyAdapter;
export declare const isExpressAdapter: (adapter: BullBoardServerAdapter) => adapter is BullBoardExpressAdapter;

import { OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { BullBoardInstance, BullBoardQueueOptions } from "./bull-board.types";
export declare class BullBoardFeatureModule implements OnModuleInit {
    private readonly moduleRef;
    private readonly queues;
    private readonly board;
    constructor(moduleRef: ModuleRef, queues: BullBoardQueueOptions[], board: BullBoardInstance);
    onModuleInit(): any;
}

import { DynamicModule, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { BullBoardModuleAsyncOptions, BullBoardModuleOptions, BullBoardServerAdapter } from "./bull-board.types";
import { ApplicationConfig, HttpAdapterHost } from "@nestjs/core";
export declare class BullBoardRootModule implements NestModule {
    private readonly adapterHost;
    private readonly applicationConfig;
    private readonly adapter;
    private readonly options;
    constructor(adapterHost: HttpAdapterHost, applicationConfig: ApplicationConfig, adapter: BullBoardServerAdapter, options: BullBoardModuleOptions);
    configure(consumer: MiddlewareConsumer): any;
    static forRoot(options: BullBoardModuleOptions): DynamicModule;
    static forRootAsync(options: BullBoardModuleAsyncOptions): DynamicModule;
}

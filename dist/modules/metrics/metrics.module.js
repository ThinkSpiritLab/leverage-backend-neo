"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsModule = exports.JUDGE_DURATION_HISTOGRAM = exports.SUBMISSION_TOTAL_COUNTER = void 0;
const common_1 = require("@nestjs/common");
const nestjs_prometheus_1 = require("@willsoto/nestjs-prometheus");
exports.SUBMISSION_TOTAL_COUNTER = 'submission_total';
exports.JUDGE_DURATION_HISTOGRAM = 'judge_duration_seconds';
let MetricsModule = class MetricsModule {
};
exports.MetricsModule = MetricsModule;
exports.MetricsModule = MetricsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nestjs_prometheus_1.PrometheusModule.register({
                defaultMetrics: {
                    enabled: true,
                },
                path: '/metrics',
            }),
        ],
        providers: [
            (0, nestjs_prometheus_1.makeCounterProvider)({
                name: exports.SUBMISSION_TOTAL_COUNTER,
                help: 'Total number of submissions received',
                labelNames: ['language', 'status'],
            }),
            (0, nestjs_prometheus_1.makeHistogramProvider)({
                name: exports.JUDGE_DURATION_HISTOGRAM,
                help: 'Duration of judge requests in seconds',
                labelNames: ['status', 'language'],
                buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
            }),
        ],
        exports: [nestjs_prometheus_1.PrometheusModule],
    })
], MetricsModule);
//# sourceMappingURL=metrics.module.js.map
import { Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

export const SUBMISSION_TOTAL_COUNTER = 'submission_total';
export const JUDGE_DURATION_HISTOGRAM = 'judge_duration_seconds';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
      path: '/metrics',
    }),
  ],
  providers: [
    makeCounterProvider({
      name: SUBMISSION_TOTAL_COUNTER,
      help: 'Total number of submissions received',
      labelNames: ['language', 'status'],
    }),
    makeHistogramProvider({
      name: JUDGE_DURATION_HISTOGRAM,
      help: 'Duration of judge requests in seconds',
      labelNames: ['status', 'language'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    }),
  ],
  exports: [PrometheusModule],
})
export class MetricsModule {}

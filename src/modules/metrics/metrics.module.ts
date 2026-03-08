import { Global, Module } from '@nestjs/common';
import {
  getToken,
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

export const SUBMISSION_TOTAL_COUNTER = 'submission_total';
export const JUDGE_DURATION_HISTOGRAM = 'judge_duration_seconds';
export const JUDGE_QUEUE_WAITING_GAUGE = 'judge_queue_waiting';
export const JUDGE_QUEUE_ACTIVE_GAUGE = 'judge_queue_active';
export const LOGIN_TOTAL_COUNTER = 'login_total';

@Global()
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
    makeGaugeProvider({
      name: JUDGE_QUEUE_WAITING_GAUGE,
      help: 'Number of jobs waiting in the judge queue',
    }),
    makeGaugeProvider({
      name: JUDGE_QUEUE_ACTIVE_GAUGE,
      help: 'Number of jobs actively being processed in the judge queue',
    }),
    makeCounterProvider({
      name: LOGIN_TOTAL_COUNTER,
      help: 'Total number of login attempts',
      labelNames: ['success', 'type'],
    }),
  ],
  exports: [
    PrometheusModule,
    getToken(SUBMISSION_TOTAL_COUNTER),
    getToken(JUDGE_DURATION_HISTOGRAM),
    getToken(JUDGE_QUEUE_WAITING_GAUGE),
    getToken(JUDGE_QUEUE_ACTIVE_GAUGE),
    getToken(LOGIN_TOTAL_COUNTER),
  ],
})
export class MetricsModule {}

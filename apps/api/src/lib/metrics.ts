import client from 'prom-client';

/**
 * Prometheus-format metrics — previously this codebase had no `/metrics`
 * endpoint and no APM integration at all (the observability audit's
 * highest-value gap after crash reporting: no latency/error-rate/
 * throughput visibility on the search/matching/pricing endpoints
 * docs/architecture/overview.md itself flags as highest-value to watch).
 * `prom-client`'s default registry + default metrics (event loop lag,
 * memory, GC pauses) plus two custom series covering every HTTP request —
 * enough for a real Prometheus/Grafana setup to alert on without adding a
 * commercial APM dependency.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

import { describe, it, expect, beforeEach } from 'vitest';
import { registry, httpRequestDurationSeconds, httpRequestsTotal } from '../metrics.js';

describe('metrics', () => {
  beforeEach(() => {
    httpRequestDurationSeconds.reset();
    httpRequestsTotal.reset();
  });

  it('exposes both custom HTTP series in Prometheus text format', async () => {
    httpRequestsTotal.inc({ method: 'GET', route: '/api/v1/health', status_code: '200' });
    httpRequestDurationSeconds.observe(
      { method: 'GET', route: '/api/v1/health', status_code: '200' },
      0.05,
    );

    const output = await registry.metrics();

    expect(output).toContain('http_requests_total');
    expect(output).toContain('http_request_duration_seconds');
    expect(output).toContain('route="/api/v1/health"');
    expect(output).toContain('status_code="200"');
  });

  it('includes Node process default metrics (event loop, memory)', async () => {
    const output = await registry.metrics();
    expect(output).toContain('process_resident_memory_bytes');
  });
});

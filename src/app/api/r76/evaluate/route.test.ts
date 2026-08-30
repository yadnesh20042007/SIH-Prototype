import { describe, it, expect } from 'vitest';
import { POST } from './route';
import { validEvaluationFixture } from './fixture';

describe('POST /api/r76/evaluate', () => {
  it('returns 200 and orchestration result for valid input', async () => {
    const request = new Request('http://localhost/api/r76/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvaluationFixture),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('overallOutcome');
    expect(data.overallOutcome).toBe('pass'); // given the mock data
  });

  it('returns 400 for missing fields', async () => {
    const request = new Request('http://localhost/api/r76/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instrument: validEvaluationFixture.instrument }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    
    const data = await response.json();
    expect(data.error).toContain('Missing required top-level fields');
  });

  it('returns 400 for malformed json', async () => {
    const request = new Request('http://localhost/api/r76/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    
    const data = await response.json();
    expect(data.error).toBe('Malformed JSON payload');
  });
});

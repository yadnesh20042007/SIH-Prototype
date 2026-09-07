import { beforeEach, describe, expect, it, vi } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: { createApproval: vi.fn(), listApprovals: vi.fn() },
}));

vi.mock('@/lib/services/approval.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/services/approval.service')>();
  return { ...original, ...serviceMock };
});

import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import { ApprovalWorkflowValidationError } from '@/lib/services/approval.service';
import { GET, POST } from './route';

const approval = {
  id: 'approval-1', sessionId: 'session-1', userId: 'technician-1',
  action: 'SUBMIT_FOR_REVIEW', comments: null,
  createdAt: '2026-09-06T12:00:00.000Z',
};
const workflowResult = {
  approval,
  session: {
    id: 'session-1', status: 'PENDING_REVIEW', reviewerId: null, approverId: null,
    completedAt: null, updatedAt: '2026-09-06T12:00:00.000Z',
  },
};

function post(body: unknown): Request {
  return new Request('http://localhost/api/approvals', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('Approval collection route unit tests (mocked service)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an approval workflow action with HTTP 201', async () => {
    serviceMock.createApproval.mockResolvedValue(workflowResult);
    const response = await POST(post({
      sessionId: ' session-1 ', userId: ' technician-1 ', action: 'SUBMIT_FOR_REVIEW',
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(workflowResult);
    expect(serviceMock.createApproval).toHaveBeenCalledWith({
      sessionId: 'session-1', userId: 'technician-1', action: 'SUBMIT_FOR_REVIEW',
    });
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(new Request('http://localhost/api/approvals', {
      method: 'POST', body: '{invalid',
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON payload' });
  });

  it('returns 400 for validation failure', async () => {
    const response = await POST(post({ sessionId: ' ', userId: 4, action: 'APPROVE' }));
    expect(response.status).toBe(400);
    expect(serviceMock.createApproval).not.toHaveBeenCalled();
  });

  it('lists approvals with HTTP 200', async () => {
    serviceMock.listApprovals.mockResolvedValue([approval]);
    const response = await GET(new Request('http://localhost/api/approvals'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([approval]);
    expect(serviceMock.listApprovals).toHaveBeenCalledWith();
  });

  it('filters approvals by a trimmed TestSession ID', async () => {
    serviceMock.listApprovals.mockResolvedValue([approval]);
    const response = await GET(new Request(
      'http://localhost/api/approvals?testSessionId=%20session-1%20'
    ));
    expect(response.status).toBe(200);
    expect(serviceMock.listApprovals).toHaveBeenCalledWith({ testSessionId: 'session-1' });
  });

  it('rejects an empty TestSession filter', async () => {
    const response = await GET(new Request(
      'http://localhost/api/approvals?testSessionId=%20%20'
    ));
    expect(response.status).toBe(400);
  });

  it('maps invalid workflow ordering or role to 400', async () => {
    serviceMock.createApproval.mockRejectedValue(
      new ApprovalWorkflowValidationError('FINAL_APPROVE is not valid while the session is DRAFT')
    );
    expect((await POST(post({
      sessionId: 's', userId: 'u', action: 'FINAL_APPROVE',
    }))).status).toBe(400);
  });

  it('maps missing sessions or users to 404', async () => {
    serviceMock.createApproval.mockRejectedValue(new DatabaseNotFoundError('TestSession not found'));
    expect((await POST(post({
      sessionId: 'missing', userId: 'u', action: 'SUBMIT_FOR_REVIEW',
    }))).status).toBe(404);
  });

  it('maps foreign-key errors to 400', async () => {
    serviceMock.createApproval.mockRejectedValue(new DatabaseForeignKeyError('Safe FK error'));
    expect((await POST(post({
      sessionId: 's', userId: 'u', action: 'SUBMIT_FOR_REVIEW',
    }))).status).toBe(400);
  });

  it('maps stale, missing, duplicate, or concurrent state conflicts to 409', async () => {
    serviceMock.createApproval.mockRejectedValue(new DatabaseConflictError('Result is stale'));
    expect((await POST(post({
      sessionId: 's', userId: 'u', action: 'SUBMIT_FOR_REVIEW',
    }))).status).toBe(409);
  });

  it('maps unexpected errors to a safe 500', async () => {
    serviceMock.listApprovals.mockRejectedValue(new Error('Raw database details'));
    const response = await GET(new Request('http://localhost/api/approvals'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});

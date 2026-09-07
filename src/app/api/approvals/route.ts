import {
  DatabaseConflictError,
  DatabaseForeignKeyError,
  DatabaseNotFoundError,
} from '@/lib/db/errors';
import {
  ApprovalWorkflowValidationError,
  createApproval,
  listApprovals,
} from '@/lib/services/approval.service';
import { validateApprovalCreate } from '@/lib/validation/approval';
import { requireApiUser } from '@/lib/auth/api-access';

const ACTION_ROLES = {
  SUBMIT_FOR_REVIEW: ['LAB_TECHNICIAN', 'ADMIN'],
  CANCEL: ['LAB_TECHNICIAN', 'ADMIN'],
  REVIEW_APPROVE: ['REVIEWING_OFFICER', 'ADMIN'],
  REVIEW_REJECT: ['REVIEWING_OFFICER', 'ADMIN'],
  FINAL_APPROVE: ['APPROVING_OFFICER', 'ADMIN'],
  FINAL_REJECT: ['APPROVING_OFFICER', 'ADMIN'],
} as const;

function serviceErrorResponse(error: unknown): Response {
  if (error instanceof ApprovalWorkflowValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DatabaseNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof DatabaseForeignKeyError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DatabaseConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(request: Request): Promise<Response> {
  const authentication = await requireApiUser([
    'LAB_TECHNICIAN', 'REVIEWING_OFFICER', 'APPROVING_OFFICER', 'ADMIN',
  ]);
  if (!authentication.authorized) return authentication.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const validation = validateApprovalCreate(body);
  if (!validation.success || !validation.data) {
    return Response.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 400 }
    );
  }

  if (!ACTION_ROLES[validation.data.action].some((role) => role === authentication.user.role)) {
    return Response.json({ error: 'Insufficient permissions for this workflow action' }, { status: 403 });
  }

  try {
    return Response.json(
      await createApproval(validation.data, authentication.user.id),
      { status: 201 },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  const rawSessionId = new URL(request.url).searchParams.get('testSessionId');
  let testSessionId: string | undefined;

  if (rawSessionId !== null) {
    testSessionId = rawSessionId.trim();
    if (!testSessionId) {
      return Response.json({ error: 'Invalid test session ID' }, { status: 400 });
    }
  }

  try {
    const approvals = testSessionId
      ? await listApprovals({ testSessionId })
      : await listApprovals();
    return Response.json(approvals, { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

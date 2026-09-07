import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import {
  createManufacturer,
  listManufacturers,
} from '@/lib/services/manufacturer.service';
import { validateManufacturerCreate } from '@/lib/validation/manufacturer';
import { requireApiUser } from '@/lib/auth/api-access';

function serviceErrorResponse(error: unknown): Response {
  if (error instanceof DatabaseNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof DatabaseConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(request: Request): Promise<Response> {
  const access = await requireApiUser(['LAB_TECHNICIAN', 'ADMIN']);
  if (!access.authorized) return access.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const validation = validateManufacturerCreate(body);
  if (!validation.success || !validation.data) {
    return Response.json(
      { error: 'Validation failed', errors: validation.errors },
      { status: 400 }
    );
  }

  try {
    const manufacturer = await createManufacturer(validation.data);
    return Response.json(manufacturer, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function GET(): Promise<Response> {
  try {
    return Response.json(await listManufacturers(), { status: 200 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

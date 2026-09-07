import { NextResponse } from 'next/server';
import { evaluateInstrumentCompliance, TestObservations } from '../../../../lib/r76/engine';
import { Instrument } from '../../../../lib/r76/types/instrument';
import { VerificationContext } from '../../../../lib/r76/types/verification';
import { evaluateSavedSession } from '@/lib/services/session-evaluation.service';
import { DatabaseConflictError, DatabaseNotFoundError } from '@/lib/db/errors';
import { forbiddenOwnership, requireApiUser, technicianOwnsSession } from '@/lib/auth/api-access';

export async function POST(req: Request) {
  const access = await requireApiUser(['LAB_TECHNICIAN', 'ADMIN']);
  if (!access.authorized) return access.response;
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if ('sessionId' in body) {
      if (typeof body.sessionId !== 'string' || !body.sessionId.trim()) {
        return NextResponse.json({ error: 'Invalid test session ID' }, { status: 400 });
      }
      if (!await technicianOwnsSession(access.user, body.sessionId.trim())) return forbiddenOwnership();
      return NextResponse.json(await evaluateSavedSession(body.sessionId.trim(), {
        instrument: body.instrument,
        verificationContext: body.verificationContext,
        observations: body.observations,
      }));
    }

    const instrument = body.instrument as Instrument;
    const verificationContext = body.verificationContext as VerificationContext;
    const observations = body.observations as TestObservations;

    if (!instrument || !verificationContext || !observations) {
      return NextResponse.json(
        { error: 'Missing required top-level fields: instrument, verificationContext, observations' },
        { status: 400 }
      );
    }

    const result = evaluateInstrumentCompliance(instrument, verificationContext, observations);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DatabaseNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DatabaseConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error evaluating R76 compliance:', error);
    return NextResponse.json({ error: 'Internal server error during evaluation' }, { status: 500 });
  }
}

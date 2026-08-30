import { NextResponse } from 'next/server';
import { evaluateInstrumentCompliance, TestObservations } from '../../../../lib/r76/engine';
import { Instrument } from '../../../../lib/r76/types/instrument';
import { VerificationContext } from '../../../../lib/r76/types/verification';

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
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
    console.error('Error evaluating R76 compliance:', error);
    return NextResponse.json({ error: 'Internal server error during evaluation' }, { status: 500 });
  }
}

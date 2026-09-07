interface ServerErrorDetails {
  name: string;
  message: string;
  stack?: string;
}

/** Logs useful server diagnostics without serializing arbitrary error metadata. */
export function logServerError(context: string, error: unknown): void {
  const details: ServerErrorDetails = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: 'NonErrorThrown', message: 'An unknown non-Error value was thrown' };
  console.error(context, details);
}

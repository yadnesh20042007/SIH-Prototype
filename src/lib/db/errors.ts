/** Stable application errors for failures at the database boundary. */

export type DatabaseErrorCode = 'CONFLICT' | 'FOREIGN_KEY' | 'NOT_FOUND' | 'DATABASE_ERROR';

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: DatabaseErrorCode
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class DatabaseConflictError extends DatabaseError {
  constructor(message: string) {
    super(message, 'CONFLICT');
    this.name = 'DatabaseConflictError';
  }
}

export class DatabaseNotFoundError extends DatabaseError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
    this.name = 'DatabaseNotFoundError';
  }
}

export class DatabaseForeignKeyError extends DatabaseError {
  constructor(message: string) {
    super(message, 'FOREIGN_KEY');
    this.name = 'DatabaseForeignKeyError';
  }
}

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** Throws a safe application error corresponding to a database failure. */
export function throwMappedDatabaseError(error: unknown, entity: string): never {
  if (error instanceof DatabaseError) throw error;

  switch (prismaErrorCode(error)) {
    case 'P2034':
      throw new DatabaseConflictError('Saved data changed concurrently; reload and retry');
    case 'P2002':
      throw new DatabaseConflictError(`${entity} already exists with the supplied unique value`);
    case 'P2003':
      throw new DatabaseForeignKeyError(`${entity} references a related record that does not exist`);
    case 'P2025':
      throw new DatabaseNotFoundError(`${entity} not found`);
    default:
      throw new DatabaseError(`Unable to complete the ${entity.toLowerCase()} database operation`, 'DATABASE_ERROR');
  }
}

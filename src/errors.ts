export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof Error;
}

export function appError(message: string, status: number, code: string): AppError {
  const err = new Error(message) as AppError;
  err.status = status;
  err.code = code;
  return err;
}

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function badRequest(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, 400, details);
}

export function unauthenticated(message = "Missing or invalid credentials"): AppError {
  return new AppError("UNAUTHENTICATED", message, 401);
}

export function forbidden(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, 403, details);
}

export function notFound(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, 404, details);
}

export function conflict(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, 409, details);
}

export function unprocessable(code: string, message: string, details?: unknown): AppError {
  return new AppError(code, message, 422, details);
}

export function notImplemented(milestone: string): AppError {
  return new AppError(
    "NOT_IMPLEMENTED",
    "This endpoint is scaffolded but not yet implemented.",
    501,
    { milestone },
  );
}

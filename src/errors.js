/**
 * Uniform error contract.
 *
 * Every failure the agent can observe is an `AppError` with a stable
 * `code`. The HTTP layer, the MCP layer and the batch endpoint all
 * serialise it the same way, so a tool that behaves well in one transport
 * behaves well in all of them.
 */

export const ErrorCode = {
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  CONFLICT: 'conflict',
  UPSTREAM: 'upstream_error',
  UNSUPPORTED: 'unsupported',
  INTERNAL: 'internal_error',
};

export class AppError extends Error {
  /**
   * @param {string} code one of ErrorCode
   * @param {string} message human readable, safe to show to an LLM
   * @param {object} [details] structured extra context
   */
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  toJSON() {
    const out = { code: this.code, message: this.message };
    if (this.details !== undefined) out.details = this.details;
    return out;
  }
}

export const invalidInput = (message, details) =>
  new AppError(ErrorCode.INVALID_INPUT, message, details);
export const notFound = (message, details) =>
  new AppError(ErrorCode.NOT_FOUND, message, details);
export const unauthorized = (message, details) =>
  new AppError(ErrorCode.UNAUTHORIZED, message, details);
export const forbidden = (message, details) =>
  new AppError(ErrorCode.FORBIDDEN, message, details);
export const conflict = (message, details) =>
  new AppError(ErrorCode.CONFLICT, message, details);
export const upstream = (message, details) =>
  new AppError(ErrorCode.UPSTREAM, message, details);
export const unsupported = (message, details) =>
  new AppError(ErrorCode.UNSUPPORTED, message, details);

/**
 * Normalise anything thrown into an AppError.
 * @param {unknown} err
 * @returns {AppError}
 */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return new AppError(ErrorCode.INTERNAL, err.message, { name: err.name });
  }
  return new AppError(ErrorCode.INTERNAL, String(err));
}

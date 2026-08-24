/**
 * Shared API DTO types — match the shape the API returns.
 */

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

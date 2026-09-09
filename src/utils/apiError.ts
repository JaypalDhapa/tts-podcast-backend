export class ApiError extends Error {
  status: number;
  /** Logged server-side only. Never included in the HTTP response. */
  internalDetail?: string;
  code?: string;

  constructor(status: number, message: string, internalDetail?: string, code?: string) {
    super(message);
    this.status = status;
    this.internalDetail = internalDetail;
    this.code = code;
  }
}

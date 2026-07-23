// Standardized API envelope builder.
// Every response the server sends must follow the shape:
//   { status: string, message: string, data: object|array|null }

const send = (res, httpCode, status, message, data = null) =>
  res.status(httpCode).json({ status, message, data });

export const success = (res, data, message = 'Request successful.') =>
  send(res, 200, 'SUCCESS', message, data);

export const created = (res, data, message = 'Resource created.') =>
  send(res, 201, 'CREATED', message, data);

export const updated = (res, data, message = 'Resource updated.') =>
  send(res, 200, 'UPDATED', message, data);

export const deleted = (res, message = 'Resource deleted.') =>
  send(res, 200, 'DELETED', message, null);

// data defaults to null (a singular resource that legitimately doesn't
// exist yet — e.g. a department with no blueprint configured). List
// endpoints pass their own empty array instead, so `data` stays an array —
// callers on the frontend can keep doing `list.map(...)` / `list.length`
// unchanged; only the envelope's `status` flags the list as empty.
export const noData = (res, message = 'No records found.', data = null) =>
  send(res, 200, 'NO_DATA', message, data);

export const notFound = (res, message = 'Resource not found.') =>
  send(res, 404, 'NOT_FOUND', message, null);

export const unauthorized = (res, message = 'Authentication required.') =>
  send(res, 401, 'UNAUTHORIZED', message, null);

export const forbidden = (res, message = 'Access denied.') =>
  send(res, 403, 'FORBIDDEN', message, null);

export const validationError = (res, message = 'Validation failed.') =>
  send(res, 400, 'VALIDATION_ERROR', message, null);

export const conflict = (res, message = 'Resource already exists.') =>
  send(res, 409, 'CONFLICT', message, null);

export const serverError = (res, message = 'Internal server error.') =>
  send(res, 500, 'SERVER_ERROR', message, null);

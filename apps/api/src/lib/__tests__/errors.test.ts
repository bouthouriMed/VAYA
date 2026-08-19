import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from '../errors.js';

describe('AppError', () => {
  it('creates error with defaults', () => {
    const error = new AppError('test');
    expect(error.message).toBe('test');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.isOperational).toBe(true);
  });

  it('creates error with custom values', () => {
    const error = new AppError('custom', 418, 'TEAPOT', false);
    expect(error.statusCode).toBe(418);
    expect(error.code).toBe('TEAPOT');
    expect(error.isOperational).toBe(false);
  });
});

describe('NotFoundError', () => {
  it('creates 404 error with resource name', () => {
    const error = new NotFoundError('User');
    expect(error.message).toBe('User not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('defaults to "Resource"', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Resource not found');
  });
});

describe('ValidationError', () => {
  it('creates 400 error with details', () => {
    const details = { email: ['Invalid email'] };
    const error = new ValidationError('Invalid input', details);
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
  });
});

describe('UnauthorizedError', () => {
  it('creates 401 error', () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Unauthorized');
  });
});

describe('ForbiddenError', () => {
  it('creates 403 error', () => {
    const error = new ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Forbidden');
  });
});

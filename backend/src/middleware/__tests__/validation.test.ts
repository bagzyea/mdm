import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { validate, validateParams, validateQuery } from '../validation';

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('validate()', () => {
    const schema = Joi.object({
      username: Joi.string().min(3).required(),
      email: Joi.string().email().required(),
      age: Joi.number().min(18).optional()
    });

    it('should pass validation with valid data', () => {
      mockRequest.body = {
        username: 'testuser',
        email: 'test@example.com',
        age: 25
      };

      validate(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should fail validation with invalid data', () => {
      mockRequest.body = {
        username: 'ab', // Too short
        email: 'invalid-email',
        age: 15 // Too young
      };

      validate(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'username',
            message: expect.stringContaining('at least')
          }),
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('valid email')
          }),
          expect.objectContaining({
            field: 'age',
            message: expect.stringContaining('18')
          })
        ])
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should strip unknown fields', () => {
      mockRequest.body = {
        username: 'testuser',
        email: 'test@example.com',
        unknownField: 'should be removed'
      };

      validate(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).not.toHaveProperty('unknownField');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateParams()', () => {
    const schema = Joi.object({
      id: Joi.string().uuid().required()
    });

    it('should validate parameters successfully', () => {
      mockRequest.params = {
        id: '123e4567-e89b-12d3-a456-426614174000'
      };

      validateParams(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid UUID', () => {
      mockRequest.params = {
        id: 'invalid-uuid'
      };

      validateParams(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Parameter validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'id',
            message: expect.stringContaining('valid GUID')
          })
        ])
      });
    });
  });

  describe('validateQuery()', () => {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      search: Joi.string().optional()
    });

    it('should validate query parameters with defaults', () => {
      mockRequest.query = {};

      validateQuery(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.query).toEqual({
        page: 1,
        limit: 20
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate query parameters with provided values', () => {
      mockRequest.query = {
        page: '2',
        limit: '10',
        search: 'test'
      };

      validateQuery(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fail validation for out-of-range values', () => {
      mockRequest.query = {
        page: '0',
        limit: '200'
      };

      validateQuery(schema)(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Query validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'page',
            message: expect.stringContaining('greater than or equal to 1')
          }),
          expect.objectContaining({
            field: 'limit',
            message: expect.stringContaining('less than or equal to 100')
          })
        ])
      });
    });
  });
});
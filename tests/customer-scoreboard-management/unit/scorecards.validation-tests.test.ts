import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { paginationQuery, scorecardPayload, updateScorecardPayload } from '../../../src/routes/scorecards';

describe('Scorecards Validation', () => {
  describe('Pagination Query Schema', () => {
    it('should validate valid page numbers', () => {
      const validPage = { page: 1, limit: 20 };
      expect(() => paginationQuery.parse(validPage)).not.toThrow();
      
      const validPage2 = { page: 10, limit: 50 };
      expect(() => paginationQuery.parse(validPage2)).not.toThrow();
    });

    it('should reject invalid page numbers', () => {
      const invalidPage = { page: 0, limit: 20 };
      expect(() => paginationQuery.parse(invalidPage)).toThrow();
      
      const negativePage = { page: -1, limit: 20 };
      expect(() => paginationQuery.parse(negativePage)).toThrow();
      
      const floatPage = { page: 1.5, limit: 20 };
      expect(() => paginationQuery.parse(floatPage)).toThrow();
    });

    it('should validate limit boundaries', () => {
      const minLimit = { page: 1, limit: 1 };
      expect(() => paginationQuery.parse(minLimit)).not.toThrow();
      
      const maxLimit = { page: 1, limit: 100 };
      expect(() => paginationQuery.parse(maxLimit)).not.toThrow();
      
      const overLimit = { page: 1, limit: 101 };
      expect(() => paginationQuery.parse(overLimit)).toThrow();
      
      const zeroLimit = { page: 1, limit: 0 };
      expect(() => paginationQuery.parse(zeroLimit)).toThrow();
    });

    it('should accept optional query parameters', () => {
      const withOptional = {
        page: 1,
        limit: 20,
        q: 'test search',
        customerId: 1,
        subscriptionId: 2,
        assignedTo: 3,
        status: 1,
        category: 2,
        pic: 1,
        sortBy: 'title',
        sortOrder: 'desc'
      };
      
      expect(() => paginationQuery.parse(withOptional)).not.toThrow();
    });

    it('should reject invalid sortBy values', () => {
      const invalidSortBy = { page: 1, limit: 20, sortBy: 'invalidField' };
      expect(() => paginationQuery.parse(invalidSortBy)).toThrow();
    });

    it('should reject invalid sortOrder values', () => {
      const invalidSortOrder = { page: 1, limit: 20, sortOrder: 'invalid' };
      expect(() => paginationQuery.parse(invalidSortOrder)).toThrow();
    });

    it('should use default values for optional fields', () => {
      const minimal = {};
      const result = paginationQuery.parse(minimal);
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.q).toBeUndefined();
      expect(result.customerId).toBeUndefined();
    });
  });

  describe('Scorecard Payload Schema', () => {
    it('should validate payload with required title field', () => {
      const validPayload = { title: 'Test KPI' };
      expect(() => scorecardPayload.parse(validPayload)).not.toThrow();
    });

    it('should reject payload without title', () => {
      const invalidPayload = {};
      expect(() => scorecardPayload.parse(invalidPayload)).toThrow();
      
      const emptyTitle = { title: '' };
      expect(() => scorecardPayload.parse(emptyTitle)).toThrow();
      
      const whitespaceTitle = { title: '   ' };
      expect(() => scorecardPayload.parse(whitespaceTitle)).toThrow();
    });

    it('should validate payload with all optional fields', () => {
      const fullPayload = {
        title: 'Complete KPI',
        customerId: 1,
        subscriptionId: 2,
        assignedTo: 3,
        description: 'Test description',
        pic: 1,
        category: 2,
        targetValue: '85.00',
        targetType: 1,
        unitValue: 5,
        unitCustom: 'custom unit',
        frequency: 2,
        showOnScorecard: 0,
        greenThreshold: 95,
        yellowThreshold: 75,
        status: 1
      };
      
      expect(() => scorecardPayload.parse(fullPayload)).not.toThrow();
    });

    it('should coerce string numbers to integers', () => {
      const stringNumbers = {
        title: 'Test',
        customerId: '1',
        subscriptionId: '2',
        assignedTo: '3',
        pic: '1',
        category: '2',
        targetType: '1',
        unitValue: '5',
        frequency: '2',
        showOnScorecard: '0',
        greenThreshold: '95',
        yellowThreshold: '75',
        status: '1'
      };
      
      const result = scorecardPayload.parse(stringNumbers);
      expect(typeof result.customerId).toBe('number');
      expect(typeof result.subscriptionId).toBe('number');
      expect(typeof result.assignedTo).toBe('number');
    });

    it('should use default values for numeric fields', () => {
      const minimalPayload = { title: 'Test KPI' };
      const result = scorecardPayload.parse(minimalPayload);
      
      expect(result.pic).toBe(0);
      expect(result.category).toBe(0);
      expect(result.targetType).toBe(0);
      expect(result.unitValue).toBe(0);
      expect(result.frequency).toBe(1);
      expect(result.showOnScorecard).toBe(1);
      expect(result.greenThreshold).toBe(100);
      expect(result.yellowThreshold).toBe(80);
      expect(result.status).toBe(1);
    });
  });

  describe('Update Scorecard Payload Schema', () => {
    it('should validate partial updates', () => {
      const partialUpdate = { title: 'Updated Title' };
      expect(() => updateScorecardPayload.parse(partialUpdate)).not.toThrow();
    });

    it('should validate empty payload (all fields optional)', () => {
      const emptyPayload = {};
      expect(() => updateScorecardPayload.parse(emptyPayload)).not.toThrow();
    });

    it('should validate multiple field updates', () => {
      const multipleUpdate = {
        title: 'New Title',
        description: 'New description',
        status: 0,
        targetValue: '90.00'
      };
      expect(() => updateScorecardPayload.parse(multipleUpdate)).not.toThrow();
    });

    it('should still validate field types in partial updates', () => {
      const invalidPartial = {
        title: '', // Should fail - empty string
        customerId: 'invalid' // Should fail - not a number
      };
      expect(() => updateScorecardPayload.parse(invalidPartial)).toThrow();
    });

    it('should allow null values for nullable fields', () => {
      const withNulls = {
        customerId: null,
        subscriptionId: null,
        assignedTo: null,
        description: null,
        targetValue: null,
        unitCustom: null
      };
      expect(() => updateScorecardPayload.parse(withNulls)).not.toThrow();
    });
  });

  describe('Edge Cases and Error Messages', () => {
    it('should provide clear error messages for validation failures', () => {
      expect(() => paginationQuery.parse({ page: 0, limit: 0 })).toThrow();
      
      try {
        paginationQuery.parse({ page: 0, limit: 0 });
        fail('Expected validation to throw an error');
      } catch (error) {
        expect(error).toBeDefined();
        if (error instanceof z.ZodError && error.errors) {
          expect(error.errors.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle extreme boundary values', () => {
      const boundaryTest = {
        page: Number.MAX_SAFE_INTEGER,
        limit: 100
      };
      expect(() => paginationQuery.parse(boundaryTest)).not.toThrow();
    });

    it('should validate string coercion edge cases', () => {
      const edgeCases = {
        title: 'Test',
        customerId: '0', // Should coerce to 0
        status: 'true' // Should fail
      };
      
      expect(() => scorecardPayload.parse(edgeCases)).toThrow();
    });
  });
});

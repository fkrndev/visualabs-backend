import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeObject,
  sanitizeFields,
  sanitizeUserProfile,
} from '@/utils/security/xss';

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape less than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('should escape greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('a "b"')).toBe('a &quot;b&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("a 'b'")).toBe('a &#039;b&#039;');
  });

  it('should escape multiple special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });

  it('should return non-string values as-is', () => {
    expect(escapeHtml(123 as any)).toBe(123);
    expect(escapeHtml(null as any)).toBe(null);
    expect(escapeHtml(undefined as any)).toBe(undefined);
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('sanitizeObject', () => {
  it('should sanitize string values in object', () => {
    const obj = { name: '<script>alert("XSS")</script>', age: 25 };
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.name).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    expect(sanitized.age).toBe(25);
  });

  it('should sanitize nested objects', () => {
    const obj = { user: { name: '<b>John</b>' } };
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.user.name).toBe('&lt;b&gt;John&lt;/b&gt;');
  });

  it('should sanitize arrays', () => {
    const obj = { items: ['<a>link</a>', 'normal'] };
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.items[0]).toBe('&lt;a&gt;link&lt;/a&gt;');
    expect(sanitized.items[1]).toBe('normal');
  });

  it('should keep non-string values as-is', () => {
    const obj = { num: 123, bool: true, null: null };
    const sanitized = sanitizeObject(obj);
    
    expect(sanitized.num).toBe(123);
    expect(sanitized.bool).toBe(true);
    expect(sanitized.null).toBe(null);
  });

  it('should return null as-is', () => {
    expect(sanitizeObject(null)).toBe(null);
  });

  it('should return undefined as-is', () => {
    expect(sanitizeObject(undefined)).toBe(undefined);
  });
});

describe('sanitizeFields', () => {
  it('should sanitize only specified fields', () => {
    const obj = { name: '<b>John</b>', email: 'test@example.com', age: 25 };
    const sanitized = sanitizeFields(obj, ['name']);
    
    expect(sanitized.name).toBe('&lt;b&gt;John&lt;/b&gt;');
    expect(sanitized.email).toBe('test@example.com');
    expect(sanitized.age).toBe(25);
  });

  it('should sanitize multiple fields', () => {
    const obj = { name: '<b>John</b>', email: '<a>test@example.com</a>' };
    const sanitized = sanitizeFields(obj, ['name', 'email']);
    
    expect(sanitized.name).toBe('&lt;b&gt;John&lt;/b&gt;');
    expect(sanitized.email).toBe('&lt;a&gt;test@example.com&lt;/a&gt;');
  });

  it('should handle nested objects in specified fields', () => {
    const obj = { profile: { name: '<b>John</b>' }, age: 25 };
    const sanitized = sanitizeFields(obj, ['profile']);
    
    expect(sanitized.profile.name).toBe('&lt;b&gt;John&lt;/b&gt;');
  });

  it('should return null as-is', () => {
    expect(sanitizeFields(null, ['name'])).toBe(null);
  });
});

describe('sanitizeUserProfile', () => {
  it('should sanitize user profile fields', () => {
    const profile = {
      name: '<b>John</b>',
      email: '<a>test@example.com</a>',
      phone: '<script>alert("XSS")</script>',
      username: 'user123',
      address: '123 Main St',
      city: 'New York',
      province: 'NY',
      country: 'USA',
    };
    
    const sanitized = sanitizeUserProfile(profile);
    
    expect(sanitized.name).toBe('&lt;b&gt;John&lt;/b&gt;');
    expect(sanitized.email).toBe('&lt;a&gt;test@example.com&lt;/a&gt;');
    expect(sanitized.phone).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    expect(sanitized.username).toBe('user123');
  });

  it('should return null as-is', () => {
    expect(sanitizeUserProfile(null)).toBe(null);
  });

  it('should return undefined as-is', () => {
    expect(sanitizeUserProfile(undefined)).toBe(undefined);
  });
});

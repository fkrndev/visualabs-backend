import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeObject, sanitizeFields, sanitizeUserProfile } from '@/utils/security/xss';

describe('Sanitization', () => {
  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      const result = escapeHtml('Tom & Jerry');
      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should escape less than sign', () => {
      const result = escapeHtml('<script>alert("xss")</script>');
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should escape greater than sign', () => {
      const result = escapeHtml('1 > 0');
      expect(result).toBe('1 &gt; 0');
    });

    it('should escape double quotes', () => {
      const result = escapeHtml('Hello "World"');
      expect(result).toBe('Hello &quot;World&quot;');
    });

    it('should escape single quotes', () => {
      const result = escapeHtml("It's a test");
      expect(result).toBe('It&#039;s a test');
    });

    it('should escape multiple special characters', () => {
      const result = escapeHtml('<div class="test">Tom & Jerry</div>');
      expect(result).toBe('&lt;div class=&quot;test&quot;&gt;Tom &amp; Jerry&lt;/div&gt;');
    });

    it('should return non-string values as-is', () => {
      expect(escapeHtml(123 as any)).toBe(123);
      expect(escapeHtml(null as any)).toBe(null);
      expect(escapeHtml(undefined as any)).toBe(undefined);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize all string values in object', () => {
      const obj = { name: '<script>alert("xss")</script>', age: 25 };
      const result = sanitizeObject(obj);
      expect(result.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result.age).toBe(25);
    });

    it('should recursively sanitize nested objects', () => {
      const obj = { user: { name: '<b>Tom</b>', email: 'test@example.com' } };
      const result = sanitizeObject(obj);
      expect(result.user.name).toBe('&lt;b&gt;Tom&lt;/b&gt;');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should sanitize arrays', () => {
      const arr = ['<script>alert(1)</script>', 'normal text'];
      const result = sanitizeObject(arr);
      expect(result[0]).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(result[1]).toBe('normal text');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });

    it('should keep non-string, non-object values as-is', () => {
      const obj = { num: 123, bool: true, nil: null };
      const result = sanitizeObject(obj);
      expect(result.num).toBe(123);
      expect(result.bool).toBe(true);
      expect(result.nil).toBe(null);
    });
  });

  describe('sanitizeFields', () => {
    it('should sanitize only specified fields', () => {
      const obj = { name: '<b>Tom</b>', email: 'test@example.com', age: 25 };
      const result = sanitizeFields(obj, ['name']);
      expect(result.name).toBe('&lt;b&gt;Tom&lt;/b&gt;');
      expect(result.email).toBe('test@example.com');
      expect(result.age).toBe(25);
    });

    it('should sanitize multiple specified fields', () => {
      const obj = { name: '<b>Tom</b>', email: '<script>alert(1)</script>', age: 25 };
      const result = sanitizeFields(obj, ['name', 'email']);
      expect(result.name).toBe('&lt;b&gt;Tom&lt;/b&gt;');
      expect(result.email).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(result.age).toBe(25);
    });

    it('should handle empty fields array', () => {
      const obj = { name: '<b>Tom</b>', email: 'test@example.com' };
      const result = sanitizeFields(obj, []);
      expect(result.name).toBe('<b>Tom</b>');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('sanitizeUserProfile', () => {
    it('should sanitize user profile fields', () => {
      const profile = {
        name: '<script>alert("xss")</script>',
        email: 'test@example.com',
        phone: '628123456789',
        username: '<b>user</b>',
        address: '123 <script>Street</script>',
        city: 'Jakarta',
        province: 'DKI',
        country: 'Indonesia',
      };
      const result = sanitizeUserProfile(profile);
      expect(result.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result.username).toBe('&lt;b&gt;user&lt;/b&gt;');
      expect(result.address).toBe('123 &lt;script&gt;Street&lt;/script&gt;');
      expect(result.email).toBe('test@example.com');
      expect(result.phone).toBe('628123456789');
    });

    it('should handle null profile', () => {
      const result = sanitizeUserProfile(null);
      expect(result).toBe(null);
    });

    it('should handle undefined profile', () => {
      const result = sanitizeUserProfile(undefined);
      expect(result).toBe(undefined);
    });

    it('should handle profile with missing fields', () => {
      const profile = { name: '<b>Tom</b>', email: 'test@example.com' };
      const result = sanitizeUserProfile(profile);
      expect(result.name).toBe('&lt;b&gt;Tom&lt;/b&gt;');
      expect(result.email).toBe('test@example.com');
    });
  });
});

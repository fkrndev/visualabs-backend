import { sanitizeEmail, sanitizeUsername } from '../src/utils/sanitize';
import { cleanEmail } from '../src/utils/normalizers';

const testEmail = 'newcustomer457649203791@test.local';
const testUsername = 'u457649203791';

console.log('Original email:', testEmail);
console.log('cleanEmail:', cleanEmail(testEmail));
console.log('sanitizeEmail:', sanitizeEmail(cleanEmail(testEmail)));

console.log('Original username:', testUsername);
console.log('sanitizeUsername:', sanitizeUsername(testUsername));

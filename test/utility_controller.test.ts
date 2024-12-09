// controller.test.ts
import { describe, it, expect } from 'vitest';
import { 
    get_npm_package_name,
    getGitHubRepoNameFromUrl,
    isValidIdFormat,
    removeEscapingBackslashes,
    get_current_date
} from '../src/controllers/utility_controller'; // Adjust import path as needed

describe('Controller Utility Functions', () => {
    describe('get_npm_package_name', () => {
        it('should return the last part of the path as a package name', () => {
            expect(get_npm_package_name('/path/to/package')).toBe('package');
            expect(get_npm_package_name('just-one-level')).toBe('just-one-level');
            expect(get_npm_package_name('nested/path/here')).toBe('here');
        });
    });

    describe('getGitHubRepoNameFromUrl', () => {
        it('should extract the repository name from a GitHub URL', () => {
            const url = 'https://github.com/test-owner/test-repo';
            expect(getGitHubRepoNameFromUrl(url)).toBe('test-repo');
        });

        it('should return null if URL is not a GitHub URL', () => {
            const url = 'https://example.com/test-owner/test-repo';
            expect(getGitHubRepoNameFromUrl(url)).toBeNull();
        });
    });

    describe('isValidIdFormat', () => {
        it('should return true for valid IDs', () => {
            expect(isValidIdFormat('abc123')).toBe(true);
            expect(isValidIdFormat('user-001')).toBe(true);
        });

        it('should return false for invalid IDs', () => {
            expect(isValidIdFormat('abc_123')).toBe(false);
            expect(isValidIdFormat('hello world')).toBe(false);
        });
    });

    describe('removeEscapingBackslashes', () => {
        it('should remove escaping backslashes', () => {
            expect(removeEscapingBackslashes('Hello\\nWorld')).toBe('HellonWorld');
            expect(removeEscapingBackslashes('Path\\tHere')).toBe('PathtHere');
        });

        it('should return the original string if no escaping backslashes are present', () => {
            expect(removeEscapingBackslashes('NoEscapesHere')).toBe('NoEscapesHere');
        });
    });

    describe('get_current_date', () => {
        it('should return a string in YYYY-MM-DD HH:MM format', () => {
            const currentDate = get_current_date();
            const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
            expect(regex.test(currentDate)).toBe(true);
        });
    });
});

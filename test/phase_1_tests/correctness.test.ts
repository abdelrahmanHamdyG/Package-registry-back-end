import nock from 'nock';
import { calculateGitHubCorrectness, calculateNpmCorrectness } from '../../src/phase_1/correctnessMetric'; // Adjust path as needed
import { describe, it, expect,afterEach } from 'vitest';

// Mock GitHub and npm API URLs
const GITHUB_API_URL = 'https://api.github.com';
const NPM_API_URL = 'https://registry.npmjs.org';

describe('Correctness Metrics', () => {
    afterEach(() => {
        nock.cleanAll(); // Clean any mocks after each test
    });

    describe('GitHub Correctness', () => {
        it('should calculate correctness metric for a GitHub repository', async () => {
            // Mock GitHub issues endpoint
            nock(GITHUB_API_URL)
            .get('/repos/test-owner/test-repo/issues')
            .query({ state: 'all' })  // Ensure the query matches exactly
            .reply(200, [
                { id: 1, labels: [{'name':'Bug 1'}] },
                { id: 2, labels: [{'name':'Feature 1'}] }
            ]);

            const correctness = await calculateGitHubCorrectness('test-owner', 'test-repo', 'fake-github-token');
            expect(correctness.correctness).toBe(0.5);
        });

        it('should return correctness as 0 when all issues are bug', async () => {
            // Mock GitHub issues endpoint
            nock(GITHUB_API_URL)
            .get('/repos/test-owner/test-repo/issues')
            .query({ state: 'all' })
            .reply(200, [
                { id: 1, labels: [{'name':'Bug 1'}] },
                { id: 2, labels: [{'name':'Bug 2'}] }
            ]);

            const correctness = await calculateGitHubCorrectness('test-owner', 'test-repo', process.env.GITHUB_TOKEN || '');
            expect(correctness.correctness).toBe(0); // Default to 1 if popularity is 0
        });

        it('should return correctness as -1 when invalid repo', async () => {
            const correctness = await calculateGitHubCorrectness('test-owner', 'test-repo', process.env.GITHUB_TOKEN || '');
            expect(correctness.correctness).toBe(-1); // Default to 1 if popularity is 0
        });
    });

    describe('npm Correctness', () => {
        it('should calculate correctness metric for an npm package', async () => {
            // Mock npm package details endpoint
            nock(NPM_API_URL)
            .get('/test-package')
            .reply(200, {
                repository: { url: 'https://github.com/test-owner/test-repo' }
            });

            // Mock GitHub issues for the linked repo
            nock(GITHUB_API_URL, {
                reqheaders: {
                    accept: 'application/json, text/plain, */*',
                }
            })
            .get('/repos/test-owner/test-repo/issues')
            .query({ state: 'all' })
            .reply(200, [
                { id: 1, labels: [{'name':'Bug 1'}] },
            ]);

            const correctness = await calculateNpmCorrectness('test-package');
            expect(correctness.correctness).toBe(0); 
        });

        it('should return correctness as 1 when there are no sssues', async () => {
            // Mock npm package details endpoint
            nock(NPM_API_URL)
            .get('/test-package')
            .reply(200, {
                repository: { url: 'https://github.com/test-owner/test-repo' }
            });

            // Mock GitHub issues for the linked repo
            nock(GITHUB_API_URL, {
                reqheaders: {
                    accept: 'application/json, text/plain, */*',
                }
            })
            .get('/repos/test-owner/test-repo/issues')
            .query({ state: 'all' })
            .reply(200, [
            ]);

            const correctness = await calculateNpmCorrectness('test-package');
            expect(correctness.correctness).toBe(1); // Default to 1 if downloads are 0
        });

        it('should return correctness as -1 when invalid repo', async () => {
            const correctness = await calculateNpmCorrectness('test-package');
            expect(correctness.correctness).toBe(1); //assume correctness as 1 if no github url
        });
    });
});
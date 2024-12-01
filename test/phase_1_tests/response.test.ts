import nock from 'nock';
import { calculateGitResponsiveness, calculateNpmResponsiveness } from '../../src/phase_1/responsivenessMetric'; // Adjust path as needed
import { describe, it, expect,afterEach } from 'vitest';

// Mock GitHub and npm API URLs
const GITHUB_API_URL = 'https://api.github.com';
const NPM_API_URL = 'https://registry.npmjs.org';

describe('Responsiveness Metrics', () => {
    afterEach(() => {
        nock.cleanAll(); // Clean up mocks after each test
    });

    describe('GitHub Responsiveness', () => {
        it('should calculate responsiveness metric for a GitHub repository', async () => {
            // Mock GitHub issues endpoint
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/issues')
                .query({ state: 'all', per_page: 100, page: 1 })
                .reply(200, [
                    // One issue closes in 1 day, another in 2 days
                    { number: 1, created_at: '2022-01-01T00:00:00Z', closed_at: '2022-01-02T00:00:00Z' },
                    { number: 2, created_at: '2022-01-01T00:00:00Z', closed_at: '2022-01-03T00:00:00Z' },
                ]);

            // Mock individual GitHub issue details (though not needed as both are returned in the first request)
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/issues/1')
                .reply(200, { created_at: '2022-01-01T00:00:00Z', closed_at: '2022-01-02T00:00:00Z' });

            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/issues/2')
                .reply(200, { created_at: '2022-01-01T00:00:00Z', closed_at: '2022-01-03T00:00:00Z' });

            // Expected: average response time = (1 day + 2 days) / 2 = 1.5 days; max response time = 2 days
            const result = await calculateGitResponsiveness('test-owner', 'test-repo', 'fake-github-token');

            // Responsiveness: 1 - (average / max) = 1 - (1.5 / 365) = 0.25
            expect(result[0]).toBeCloseTo(0.995, 2);
        });

        it('should return 0 when there are no valid response times', async () => {
            // Mock GitHub issues endpoint but no valid response times
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/issues')
                .query({ state: 'all', per_page: 100, page: 1 })
                .reply(200, []); // No issues

            const result = await calculateGitResponsiveness('test-owner', 'test-repo', 'fake-github-token');
            expect(result[0]).toBe(0); // No valid response times
        });

        it('should handle failure when fetching GitHub issues gracefully', async () => {
            // Mock GitHub issues endpoint to fail
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/issues')
                .query({ state: 'all', per_page: 100, page: 1 })
                .reply(403); // Forbidden error

            const result = await calculateGitResponsiveness('test-owner', 'test-repo', 'fake-github-token');
            expect(result[0]).toBe(0); // Responsiveness should be 0 on failure
        });
    });

    describe('npm Responsiveness', () => {
        it('should calculate responsiveness metric for an npm package linked to GitHub', async () => {
            // Mock npm registry metadata
            nock(NPM_API_URL)
                .get('/test-package')
                .reply(200, {
                    repository: { url: 'https://github.com/test-owner/test-repo.git' },
                });

            // Mock GitHub issues endpoint for linked repo
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/issues')
                .query({ state: 'all', per_page: 100, page: 1 })
                .reply(200, [
                    { number: 1, created_at: '2022-01-01T00:00:00Z', closed_at: '2022-01-02T00:00:00Z' },
                ]);

            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/issues/1')
                .reply(200, { created_at: '2022-01-01T00:00:00Z', closed_at: '2022-01-02T00:00:00Z' });

            const result = await calculateNpmResponsiveness('test-package');
            expect(result.responsiveness).toBeCloseTo(1); // Perfect responsiveness (1 day for closure)
        });

        it('should return responsiveness as 1 if no GitHub repository is linked', async () => {
            // Mock npm registry metadata without a GitHub repository
            nock(NPM_API_URL)
                .get('/test-package')
                .reply(200, {});

            const result = await calculateNpmResponsiveness('test-package');
            expect(result.responsiveness).toBe(1); // Assume perfect responsiveness without GitHub repo
        });

        it('should handle failure when fetching npm metadata gracefully', async () => {
            // Mock npm registry metadata failure
            nock(NPM_API_URL)
                .get('/test-package')
                .reply(500); // Internal server error

            const result = await calculateNpmResponsiveness('test-package');
            expect(result.responsiveness).toBe(-1); // Responsiveness should be -1 on failure
        });
    });
});
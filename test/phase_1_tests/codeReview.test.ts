// codeReviewMetric.test.ts
import nock from 'nock';
import { describe, it, expect, afterEach } from 'vitest';
import { calculateCodeReviewMetric, calculateNpmCodeReview } from '../../src/phase_1/codeReviewMetric'; // Adjust path as needed

// Mock base URLs
const GITHUB_API_URL = 'https://api.github.com';
const NPM_API_URL = 'https://registry.npmjs.org';

describe('Code Review Metrics', () => {
    afterEach(() => {
        nock.cleanAll(); // Clean up any mocks after each test
    });

    describe('calculateCodeReviewMetric', () => {
        it('should return a perfect score (1.0) if repository has no code (size=0)', async () => {
            // Mock repo endpoint with size = 0 LOC
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo')
                .reply(200, { size: 0 });

            // No need to mock PRs since we won't reach that step if size=0
            const { score, latency } = await calculateCodeReviewMetric('test-owner', 'test-repo', 'fake-github-token');
            expect(score).toBe(1.0);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should return a score based on reviewed LOC vs total LOC', async () => {
            // Mock repo endpoint with some LOC
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo')
                .reply(200, { size: 1000 });

            // Mock PRs endpoint
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls')
                .query({ state: 'closed' })
                .reply(200, [
                    { number: 1 }, 
                    { number: 2 }
                ]);

            // Mock reviews for PR #1 (approved)
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls/1/reviews')
                .reply(200, [
                    { state: 'APPROVED' }
                ]);

            // Mock PR #1 files
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls/1/files')
                .reply(200, [
                    { changes: 100 },
                    { changes: 200 }
                ]);

            // Mock reviews for PR #2 (not approved)
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls/2/reviews')
                .reply(200, [
                    { state: 'COMMENTED' }
                ]);

            // Mock PR #2 files (won't count since not approved)
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls/2/files')
                .reply(200, [
                    { changes: 500 }
                ]);

            const { score, latency } = await calculateCodeReviewMetric('test-owner', 'test-repo', 'fake-github-token');
            // reviewedLOC = 300 (from PR #1), total LOC = 1000 => score = 0.3
            expect(score).toBeCloseTo(0.3, 2);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should return score=0 if API calls fail', async () => {
            // No mocks => GitHub calls fail
            const { score, latency } = await calculateCodeReviewMetric('test-owner', 'test-repo', 'fake-github-token');
            // On error, function returns {score:0, latency:0}
            expect(score).toBe(0);
            expect(latency).toBe(0);
        });
    });

    describe('calculateNpmCodeReview', () => {
        it('should return score=0 if no GitHub repo URL is found in npm package', async () => {
            // Mock npm package endpoint with no repository url
            nock(NPM_API_URL)
                .get('/test-package')
                .reply(200, { name: 'test-package' });

            const { score, latency } = await calculateNpmCodeReview('test-package');
            // No GitHub URL => score=0
            expect(score).toBe(0);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should fetch GitHub repo from npm package and calculate code review score', async () => {
            // Mock npm package endpoint with GitHub repo URL
            nock(NPM_API_URL)
                .get('/test-package')
                .reply(200, {
                    repository: { url: 'https://github.com/test-owner/test-repo.git' }
                });

            // Mock GitHub repo, PRs, and reviews similar to previous test
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo')
                .reply(200, { size: 500 });

            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls')
                .query({ state: 'closed' })
                .reply(200, [{ number: 10 }]);

            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls/10/reviews')
                .reply(200, [{ state: 'APPROVED' }]);

            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/pulls/10/files')
                .reply(200, [{ changes: 50 }]);

            const { score, latency } = await calculateNpmCodeReview('test-package');
            // reviewedLOC=50, totalLOC=500 => score=0.1
            expect(score).toBeCloseTo(0.1, 1);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        
    });
});

// dependencyMetric.test.ts
import nock from 'nock';
import { describe, it, expect, afterEach } from 'vitest';
import { calculateDependencyMetric, calculateNpmDependency } from '../../src/phase_1/dependencyMetric'; // Adjust path as needed

// Mock base URLs
const GITHUB_API_URL = 'https://api.github.com';
const NPM_API_URL = 'https://registry.npmjs.org';

describe('Dependency Metrics', () => {
    afterEach(() => {
        nock.cleanAll(); // Clean up mocks after each test
    });

    describe('calculateDependencyMetric', () => {
        it('should return a perfect score (1.0) if package.json has no dependencies', async () => {
            // Mock package.json content with no dependencies
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/contents/package.json')
                .reply(200, {
                    dependencies: {},
                    devDependencies: {}
                });

            const { score, latency } = await calculateDependencyMetric('test-owner', 'test-repo', 'fake-github-token');
            expect(score).toBe(1.0);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should return a score based on pinned dependencies vs total dependencies', async () => {
            // Suppose we have 4 dependencies: 2 pinned (exact versions) and 2 not pinned
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/contents/package.json')
                .reply(200, {
                    dependencies: {
                        "dep1": "1.0.0",        // pinned
                        "dep2": "^1.2.3"        // not pinned
                    },
                    devDependencies: {
                        "dep3": "2.3.4",        // pinned
                        "dep4": "~3.4.5"        // not pinned
                    }
                });

            const { score, latency } = await calculateDependencyMetric('test-owner', 'test-repo', 'fake-github-token');
            // totalDependencies = 4, pinned = 2 => score = 2/4 = 0.5
            expect(score).toBe(0.5);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should return score=0 if API calls fail', async () => {
            // No mocks => GitHub call fails
            const { score, latency } = await calculateDependencyMetric('test-owner', 'test-repo', 'fake-github-token');
            // On error, function returns {score:0, latency:0}
            expect(score).toBe(0);
            expect(latency).toBe(0);
        });
    });

    describe('calculateNpmDependency', () => {
        it('should return score=0 if no GitHub repo URL is found in npm package', async () => {
            // Mock npm package endpoint with no repository url
            nock(NPM_API_URL)
                .get('/test-package')
                .reply(200, { name: 'test-package' });

            const { score, latency } = await calculateNpmDependency('test-package');
            // No GitHub URL => score=0
            expect(score).toBe(0);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should fetch GitHub repo from npm package and calculate dependency score', async () => {
            // Mock npm package endpoint with GitHub repo URL
            nock(NPM_API_URL)
                .get('/test-package')
                .reply(200, {
                    repository: { url: 'https://github.com/test-owner/test-repo.git' }
                });

            // Mock GitHub package.json with some dependencies
            nock(GITHUB_API_URL)
                .get('/repos/test-owner/test-repo/contents/package.json')
                .reply(200, {
                    dependencies: {
                        "dep1": "1.0.0"  // pinned
                    },
                    devDependencies: {
                        "dep2": "^2.0.0" // not pinned
                    }
                });

            const { score, latency } = await calculateNpmDependency('test-package');
            // pinned=1, total=2 => score=0.5
            expect(score).toBe(0.5);
            expect(latency).toBeGreaterThanOrEqual(0);
        });

        it('should return score=-1 if npm request fails', async () => {
            // No mock => npm request fails
            const { score, latency } = await calculateNpmDependency('missing-package');
            expect(score).toBe(-1);
            expect(latency).toBeGreaterThanOrEqual(0);
        });
    });
});

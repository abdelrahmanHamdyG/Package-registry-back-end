import nock from 'nock';
import { calculateGitHubLicenseMetric, calculateNpmLicenseMetric } from '../../src/phase_1/License_Check'; // Adjust path as needed
import {  describe, it, expect, afterEach } from 'vitest';

// Mock GitHub and npm API URLs
const GITHUB_API_URL = 'https://api.github.com';
const NPM_API_URL = 'https://registry.npmjs.org';

describe('License Metrics', () => {
    afterEach(() => {
        nock.cleanAll(); // Clean any mocks after each test
    });

    describe('GitHub License Metric', () => {
        it('should calculate license score for a GitHub repository with compatible license', async () => {
            // Mock GitHub license endpoint
            nock(GITHUB_API_URL)
            .get('/repos/test-owner/test-repo/license')
            .reply(200, {
                license: { spdx_id: 'MIT' }
            });

            const licenseResult = await calculateGitHubLicenseMetric('test-owner', 'test-repo', process.env.GITHUB_TOKEN || '');
            expect(licenseResult.score).toBe(1); // MIT is a compatible license
        });

        it('should calculate license score for a GitHub repository with incompatible license', async () => {
            // Mock GitHub license endpoint
            nock(GITHUB_API_URL)
            .get('/repos/test-owner/test-repo/license')
            .reply(200, {
                license: { spdx_id: 'GPL-3.0' } // An incompatible license
            });

            const licenseResult = await calculateGitHubLicenseMetric('test-owner', 'test-repo', process.env.GITHUB_TOKEN || '');
            expect(licenseResult.score).toBe(0); // GPL-3.0 is not compatible with LGPL-2.1
        });

        it('should return license score as 0 when no license is found', async () => {
            // Mock GitHub license endpoint with no license
            nock(GITHUB_API_URL)
            .get('/repos/test-owner/test-repo/license')
            .reply(404, {});

            const licenseResult = await calculateGitHubLicenseMetric('test-owner', 'test-repo', process.env.GITHUB_TOKEN || '');
            expect(licenseResult.score).toBe(0); // No license means score 0
        });
    });

    describe('npm License Metric', () => {
        it('should calculate license score for an npm package with GitHub repository', async () => {
            // Mock npm package details endpoint
            nock(NPM_API_URL)
            .get('/test-package')
            .reply(200, {
                repository: { url: 'https://github.com/test-owner/test-repo' }
            });

            // Mock GitHub license endpoint for the repo
            nock(GITHUB_API_URL)
            .get('/repos/test-owner/test-repo/license')
            .reply(200, {
                license: { spdx_id: 'Apache-2.0' }
            });

            const licenseResult = await calculateNpmLicenseMetric('test-package');
            expect(licenseResult.score).toBe(1); // Apache-2.0 is compatible with LGPL-2.1
        });

        it('should return license score as 0 for an npm package with no GitHub repository', async () => {
            // Mock npm package details without a GitHub repository
            nock(NPM_API_URL)
            .get('/test-package')
            .reply(200, {});

            const licenseResult = await calculateNpmLicenseMetric('test-package');
            expect(licenseResult.score).toBe(0); // No GitHub repository means no license check, score is 0
        });

        it('should return license score as 0 when GitHub repo has an incompatible license', async () => {
            // Mock npm package details endpoint
            nock(NPM_API_URL)
            .get('/test-package')
            .reply(200, {
                repository: { url: 'https://github.com/test-owner/test-repo' }
            });

            // Mock GitHub license endpoint with an incompatible license
            nock(GITHUB_API_URL)
            .get('/repos/test-owner/test-repo/license')
            .reply(200, {
                license: { spdx_id: 'GPL-3.0' }
            });

            const licenseResult = await calculateNpmLicenseMetric('test-package');
            expect(licenseResult.score).toBe(0); // GPL-3.0 is not compatible
        });
    });
});

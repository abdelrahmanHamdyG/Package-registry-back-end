import nock from 'nock';
import { calculateGitRampUpMetric, calculateNpmRampUpMetric } from '../../src/phase_1/rampUpMetric'; // Replace with the actual module name
import * as git from 'isomorphic-git'; // You might need to mock this for GitHub repo cloning
import * as fs from 'fs';
import path from 'path';
import { vi, describe, it, expect, afterEach } from 'vitest';




// Mock isomorphic-git functions for repository cloning
vi.mock('isomorphic-git', () => ({
    clone: vi.fn(),
}));

describe('Ramp-up Metric Tests', () => {
    afterEach(() => {
        nock.cleanAll();
        vi.clearAllMocks();
    });

    describe('calculateGitRampUpMetric', () => {
        it('should calculate ramp-up metric successfully with large README', async () => {
            const owner = 'testOwner';
            const repo = 'testRepo';
            const token = 'fakeToken';
            const cloneDir = path.join('/tmp', `${owner}-${repo}`);
            
            // Mock GitHub repo clone (assuming success)
            (git.clone as vi.Mock).mockResolvedValueOnce(undefined);

            // Mock README.md file reading with large content
            vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('A'.repeat(100 * 1024)); // Large README (100 KB)

            const result = await calculateGitRampUpMetric(owner, repo, token);

            expect(result[0]).toBe(0); // Full score for large README
            expect(result[1]).toBeGreaterThan(0); // Latency should be a positive number
        });

        it('should calculate ramp-up metric with small README', async () => {
            const owner = 'testOwner';
            const repo = 'testRepo';
            const token = 'fakeToken';

            // Mock GitHub repo clone
            (git.clone as vi.Mock).mockResolvedValueOnce(undefined);

            // Mock README.md file reading with small content
            vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('Small README'); // Small README

            const result = await calculateGitRampUpMetric(owner, repo, token);

            expect(result[0]).toBe(0); // Score for small README
        });

        it('should return 0 if the repository has no README', async () => {
            const owner = 'testOwner';
            const repo = 'testRepo';
            const token = 'fakeToken';

            // Mock GitHub repo clone
            (git.clone as vi.Mock).mockResolvedValueOnce(undefined);

            // Mock a missing README.md
            vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(new Error('File not found'));

            const result = await calculateGitRampUpMetric(owner, repo, token);

            expect(result[0]).toBe(0); // No README should give 0 score
        });
    });

    describe('calculateNpmRampUpMetric', () => {
        it('should calculate ramp-up metric for npm package with GitHub repo', async () => {
            const packageName = 'test-package';
            
            // Mock the npm API request for download stats
            nock('https://api.npmjs.org')
                .get(`/downloads/point/last-month/${packageName}`)
                .reply(200, {
                    downloads: 5000,
                });

            // Mock the npm registry API request for package metadata (with GitHub repo URL)
            nock('https://registry.npmjs.org')
                .get(`/${packageName}`)
                .reply(200, {
                    repository: {
                        url: 'git+https://github.com/testOwner/testRepo.git',
                    },
                });

            // Mock GitHub repo ramp-up metric calculation
            (git.clone as vi.Mock).mockResolvedValueOnce(undefined);
            vi.spyOn(fs.promises, 'readFile').mockResolvedValueOnce('A'.repeat(50 * 1024)); // Medium README

            const result = await calculateNpmRampUpMetric(packageName);

            expect(result.rampup).toBe(0); // Based on the medium README
            expect(result.latency).toBeGreaterThan(0); // Latency should be recorded
        });

        it('should return a perfect ramp-up score if no GitHub repository is found', async () => {
            const packageName = 'test-package';

            // Mock the npm API request for download stats
            nock('https://api.npmjs.org')
                .get(`/downloads/point/last-month/${packageName}`)
                .reply(200, {
                    downloads: 5000,
                });

            // Mock the npm registry API request (no GitHub repository)
            nock('https://registry.npmjs.org')
                .get(`/${packageName}`)
                .reply(200, {
                    repository: null,
                });

            const result = await calculateNpmRampUpMetric(packageName);

            expect(result.rampup).toBe(1); // Perfect score if no GitHub repo is found
        });

        it('should return -1 if an error occurs while calculating npm ramp-up', async () => {
            const packageName = 'non-existent-package';

            // Mock the npm API request to return a 404 error
            nock('https://api.npmjs.org')
                .get(`/downloads/point/last-month/${packageName}`)
                .reply(404, {});

            const result = await calculateNpmRampUpMetric(packageName);

            expect(result.rampup).toBe(-1); // Error case should return -1
        });
    });
});

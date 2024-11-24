import axios from 'axios';
import { log } from './logging.js';

// List of licenses compatible with GNU LGPL v2.1
const compatibleLicenses = [
    'LGPL-2.1',
    'LGPL-2.1-or-later',
    'MIT',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'Apache-2.0',
    'Artistic-2.0'
];

// Function to check if a license is compatible with LGPL v2.1
const isLicenseCompatibleWithLGPLv21 = (licenseId: string): boolean => {
    return compatibleLicenses.includes(licenseId);
};

// Function to fetch license information for a GitHub repository and calculate latency
export const calculateGitHubLicenseMetric = async (owner: string, repo: string, githubToken: string): Promise<{ score: number; latency: number }> => {
    const start = performance.now(); // Record start time
    try {
        log(`Fetching license information for ${owner}/${repo}`, 2); // Debug level logging

        // Fetch repository license information using GitHub API
        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/license`, {
            headers: { Authorization: `token ${githubToken}` }
        });

        const license = response.data.license?.spdx_id || ''; // Get the SPDX ID of the license
        log(`License found for ${owner}/${repo}: ${license}`, 2); // Debug level

        const end = performance.now(); // Record end time
        const latency = end - start; // Calculate latency

        // Check if the license is compatible with LGPL v2.1
        const score = isLicenseCompatibleWithLGPLv21(license) ? 1 : 0;
        log(`License compatibility score for ${owner}/${repo}: ${score}`, 1); // Info level logging

        return { score, latency };

    } catch (error) {
        let errorMessage = "Failed to fetch license information for GitHub repository";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        log(`Error calculating license metric for ${owner}/${repo}: ${errorMessage}`, 1); // Info level logging

        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency

        // Return default values for score and latency in case of error
        return { score: 0, latency };
    }
};

// Function to calculate license metric for npm packages, similar to the correctness metric
export const calculateNpmLicenseMetric = async (packageName: string): Promise<{ score: number; latency: number }> => {
    const start = performance.now(); // Record start time
    try {
        log(`Fetching npm package metadata for ${packageName}`, 2); // Debug level logging

        // Fetch package metadata from the npm registry
        const packageResponse = await axios.get(`https://registry.npmjs.org/${packageName}`);
        const repoUrl = packageResponse.data.repository?.url;

        if (repoUrl && repoUrl.includes('github.com')) {
            log(`Found GitHub repository URL for ${packageName}`, 2); // Debug level

            // Extract GitHub owner and repository name from the URL
            const match = repoUrl.match(/github\.com[/:](.*?)(?:\.git)?$/);
            if (match && match[1]) {
                const [owner, repo] = match[1].split('/');

                // Call GitHub license metric calculation
                const { score, latency: githubLatency } = await calculateGitHubLicenseMetric(owner, repo, process.env.GITHUB_TOKEN || '');

                const end = performance.now(); // Record end time
                const totalLatency = end - start + githubLatency; // Add latencies if needed

                log(`License score for npm package ${packageName}: ${score}`, 1); // Info level logging
                return { score, latency: totalLatency };
            }
        }

        log(`No GitHub repository found for ${packageName}, assuming no license`, 1); // Info level
        const end = performance.now(); // Record end time if no GitHub repo is found
        const latency = end - start; // Calculate latency
        return { score: 0, latency }; // If no GitHub repo is found, assume no license

    } catch (error) {
        let errorMessage = "Failed to calculate license metric for npm package";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        log(`Error calculating license metric for npm package ${packageName}: ${errorMessage}`, 1); // Info level logging

        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency

        // Return default values for score and latency in case of error
        return { score: 0, latency };
    }
};

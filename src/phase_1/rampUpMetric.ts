import axios from 'axios';
import { log } from './logging.js';  // Assuming the logging module exports a log function
import * as fs from 'fs';
import * as path from 'path';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.js'; 




// Define a function to clone the repository locally using isomorphic-git
async function cloneRepo(owner: string, repo: string, token: string, cloneDir: string): Promise<void> {
    const repoUrl = `https://github.com/${owner}/${repo}.git`;
    try {
        log(`Cloning repository ${owner}/${repo} to ${cloneDir}`, 2);
        await git.clone({
            fs,
            http,
            dir: cloneDir,
            url: repoUrl,
            onAuth: () => ({ username: token }), // Authenticate using the GitHub token
            singleBranch: true,
            depth: 1, // Shallow clone for faster operations
        });
        log(`Repository cloned successfully to ${cloneDir}`, 2);
    } catch (error) {
        // Narrowing the type of error to ensure it's an Error object
        if (error instanceof Error) {
            log(`Error cloning repository: ${error.message}`, 1);
        } else {
            log('An unknown error occurred while cloning the repository', 1);
        }
        throw error;
    }
}

// Function to read the README.md file from the cloned repository
async function readReadme(cloneDir: string): Promise<string> {
    const readmePath = path.join(cloneDir, 'README.md');
    try {
        const readmeContent = await fs.promises.readFile(readmePath, 'utf8');
        log(`README.md found in the cloned repository`, 2);
        return readmeContent;
    } catch (error) {
        log(`No README.md found in the cloned repository`, 1);
        return '';
    }
}

// Function to calculate the ramp-up metric based on README.md
export async function calculateGitRampUpMetric(owner: string, repo: string, token: string): Promise<[number, number]> {
    const start = performance.now(); // Start timing
    log(`Calculating ramp-up metric for GitHub repository ${owner}/${repo}`, 1);

    const cloneDir = path.join('/tmp', `${owner}-${repo}`);  // Directory to clone the repository

    try {
        // Clone the repository locally
        await cloneRepo(owner, repo, token, cloneDir);

        // Read the README.md file from the cloned repository
        const readmeContent = await readReadme(cloneDir);

        let rampUpScore = 0;

        // Score based on the README file
        if (readmeContent.length > 0) {
            const fileSizeInKB = Buffer.byteLength(readmeContent) / 1024; // Size in KB
            log(`README file size: ${fileSizeInKB} KB`, 2);

            if (fileSizeInKB > 50) {
                rampUpScore += 10; // Large README implies good documentation
                log('Large README implies good documentation. Score: 10', 2);
            } else if (fileSizeInKB > 20) {
                rampUpScore += 7; // Medium README
                log('Medium README. Score: 7', 2);
            } else {
                rampUpScore += 3; // Small README
                log('Small README. Score: 3', 2);
            }
        } else {
            rampUpScore += 0; // No README, poor documentation
            log('No README found. Score: o', 2);
        }

        const end = performance.now(); // End timing
        const latency = end - start; // Calculate latency
        log(`Ramp-up metric calculation completed for ${owner}/${repo}. Score: ${rampUpScore / 10}, Latency: ${latency}`, 1);

        return [rampUpScore / 10, latency];

    } catch (error) {
        log(`Failed to calculate ramp-up metric for ${owner}/${repo}: ${error}`, 1);
        return [0, performance.now() - start]; // Return 0 score and elapsed time in case of error
    } finally {
        // Clean up: remove the cloned repository folder
        try {
            await fs.promises.rm(cloneDir, { recursive: true });
            log(`Removed cloned repository directory: ${cloneDir}`, 2);
        } catch (cleanupError) {
            // Narrowing the type of cleanupError
            if (cleanupError instanceof Error) {
                log(`Error cleaning up cloned directory: ${cleanupError.message}`, 1);
            } else {
                log('An unknown error occurred while cleaning up the cloned directory', 1);
            }
        }
    }
}

// Function to calculate ramp-up for npm packages
export const calculateNpmRampUpMetric = async (packageName: string): Promise<{ rampup: number; latency: number }> => {
    const start = performance.now(); // Record start time
    log(`Calculating ramp-up for npm package: ${packageName}`, 1);

    try {
        log(`Fetching npm download stats for ${packageName}`, 2);
        // Fetch download stats from npm
        const response = await axios.get(`https://api.npmjs.org/downloads/point/last-month/${packageName}`);
        const downloadCount = response.data.downloads;
        log(`Download count for ${packageName}: ${downloadCount}`, 2);

        log(`Fetching package metadata for ${packageName}`, 2);
        // Fetch package metadata from npm registry
        const packageResponse = await axios.get(`https://registry.npmjs.org/${packageName}`);
        const repoUrl = packageResponse.data.repository?.url;

        if (repoUrl && repoUrl.includes('github.com')) {
            log(`Found GitHub repository URL for ${packageName}: ${repoUrl}`, 2);

            // Extract owner and repo from the URL
            const cleanedRepoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
            const [owner, repo] = cleanedRepoUrl.split('github.com/')[1].split('/');

            log(`Calculating ramp-up metric for GitHub repository ${owner}/${repo}`, 1);
            // Calculate ramp-up using GitHub repository information
            const result = await calculateGitRampUpMetric(owner, repo, process.env.GITHUB_TOKEN || '');

            const end = performance.now(); // Record end time
            const latency = end - start; // Calculate latency

            log(`Ramp-up metric for npm package ${packageName} completed. Score: ${result[0]}, Latency: ${latency}`, 1);

            // Return combined results
            return { rampup: result[0], latency }; // Add latencies if needed
        }

        log(`No GitHub repository found for ${packageName}. Assuming perfect ramp-up score of 1.`, 1);
        const end = performance.now(); // Record end time if no GitHub repo is found
        const latency = end - start; // Calculate latency
        return { rampup: 1, latency }; // Assume perfect ramp-up if no GitHub repo is found

    } catch (error) {
        log(`Error calculating ramp-up for npm package ${packageName}: ${error}`, 1);

        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency
        
        // Return default values for ramp-up and latency in case of error
        return { rampup: -1, latency };
    }
};

import axios from 'axios';
import { log } from './logging.js';

// Function to calculate Bus Factor (HHI) for GitHub URLs
export const calculateBusFactor = async (owner: string, repo: string, githubToken: string): Promise<{ busFactor: number; latency: number }> => {
    const start = performance.now(); // Record start time
    try {
        log(`Fetching GitHub contributors for ${owner}/${repo}`, 2); // Debug level logging
        // Fetch all contributors
        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
            headers: { Authorization: `token ${githubToken}` },
            params: { anon: 'true' } // Include anonymous contributors
        });

        const contributors = response.data;
        const contributorCount = contributors.length;
        const totalCommits = contributors.reduce((total: number, contributor: { contributions: any; }) => total + contributor.contributions, 0);

        log(`Found ${contributorCount} contributors for ${owner}/${repo}`, 2); // Debug

        // Calculate HHI-based Bus Factor
        let hhi = 0;
        contributors.forEach((contributor: { login: any; contributions: number }) => {
            const proportion = contributor.contributions / totalCommits;
            hhi += proportion * proportion; // Squaring the proportion and adding it to the HHI
        });

        const busFactor =  Math.max(0, 1 - hhi);

        log(`Calculated Bus Factor (HHI) for ${owner}/${repo}: ${busFactor}`, 1);

        const end = performance.now(); // Record end time
        const latency = end - start; // Calculate latency

        return { busFactor, latency };

    } catch (error) {
        let errorMessage = "Failed to calculate Bus Factor for GitHub repository";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        log(`Error calculating Bus Factor for ${owner}/${repo}: ${errorMessage}`, 1); // Info level logging
        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency

        // Return default values for Bus Factor and latency in case of error
        return { busFactor: -1, latency };
    }
};

// Function to calculate Bus Factor for npm URLs
export const calculateNpmBusFactor = async (packageName: string): Promise<{ busFactor: number; latency: number }> => {
    const start = performance.now(); // Record start time
    try {
        log(`Fetching npm package info for ${packageName}`, 2); // Debug level
        // Fetch package info from npm
        const response = await axios.get(`https://registry.npmjs.org/${packageName}`);
        const packageInfo = response.data;

        log(`Fetching GitHub repository URL for ${packageName}`, 2); // Debug level
        // Fetch GitHub repository URL from package.json
        const repoUrl = packageInfo.repository?.url;

        if (repoUrl && repoUrl.includes('github.com')) {
            log(`Found GitHub repository URL for ${packageName}, calculating Bus Factor for GitHub repository`, 1); // Info
            const [owner, repo] = repoUrl.split('github.com/')[1].split('/');
            const { busFactor: githubBusFactor, latency: githubLatency } = await calculateBusFactor(owner, repo.split('.git')[0], process.env.GITHUB_TOKEN || '');

            // Calculate latency for npm Bus Factor
            const end = performance.now(); // Record end time
            const latency = end - start; // Calculate latency

            // Return combined results
            return { busFactor: githubBusFactor, latency: latency + githubLatency }; // Add latencies if needed

        }

        log(`Could not find GitHub repository URL for ${packageName}, assuming Bus Factor to be 0`, 1); // Info
        const end = performance.now(); // Record end time if no GitHub repo is found
        const latency = end - start; // Calculate latency
        return { busFactor: 0, latency }; // If no GitHub repo is found, assume Bus Factor is 0

    } catch (error) {
        let errorMessage = "Failed to calculate Bus Factor for npm package";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        log(`Error: ${errorMessage}`, 1); // Info
        
        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency
        
        // Return default values for Bus Factor and latency in case of error
        return { busFactor: -1, latency };
    }
};

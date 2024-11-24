import axios from 'axios';
import { log } from './logging.js'

// Function to calculate correctness for GitHub URLs
export const calculateGitHubCorrectness = async (owner: string, repo: string, githubToken: string): Promise<{ correctness: number; latency: number }> => {
    const start = performance.now(); // Record start time
    try {
        log(`Fetching GitHub issues for ${owner}/${repo}`, 2); // Debug level logging
        // Fetch all issues
        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues`, {
            headers: { Authorization: `token ${githubToken}` },
            params: { state: 'all' } // Fetch all issues, not filtered by label
        });

        // Filter issues where any label contains the word "bug"
        const bugIssues = response.data.filter((issue: any) => 
            issue.labels.some((label: any) => label.name.toLowerCase().includes('bug'))
        );
        const bugIssuesCount = bugIssues.length;

        log(`Found ${bugIssuesCount} bug issues for ${owner}/${repo}`, 2); // Debug

        const totalIssuesCount = response.data.length

        log(`${owner}/${repo} has ${totalIssuesCount} issues `, 2); // Debug

        // Avoid division by zero
        const correctness = totalIssuesCount === 0 ? 1 : 1 - (bugIssuesCount / totalIssuesCount);

        log(`Calculated correctness for ${owner}/${repo}: ${correctness}`, 1);

        const end = performance.now(); // Record end time
        const latency = end - start; // Calculate latency

        return { correctness, latency };

    } catch (error) {
        let errorMessage = "Failed to calculate correctness for GitHub repository";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        log(`Error calculating GitHub correctness for ${owner}/${repo}: ${errorMessage}`, 1); // Info level logging
        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency

        // Return default values for correctness and latency in case of error
        return { correctness: -1, latency };
    }
};

// Function to calculate correctness for npm URLs
export const calculateNpmCorrectness = async (packageName: string): Promise<{ correctness: number; latency: number }> => {
    const start = performance.now(); // Record start time
    try {
        log(`Fetching npm package info for ${packageName}`, 2); // Debug level
        // Fetch download stats from npm
        const response = await axios.get(`https://api.npmjs.org/downloads/point/last-month/${packageName}`);
        const downloadCount = response.data.downloads;

        log(`Fetching GitHub repository URL for ${packageName}`, 2); // Debug level
        // Fetch bugs from the GitHub repository of the npm package if available
        // Assuming the repository is linked in the package.json
        const packageResponse = await axios.get(`https://registry.npmjs.org/${packageName}`);
        const repoUrl = packageResponse.data.repository?.url;

        if (repoUrl && repoUrl.includes('github.com')) {
            log(`Found GitHub repository URL for ${packageName}, calculating correctness for GitHub repository`, 1); // Info
            const [owner, repo] = repoUrl.split('github.com/')[1].split('/');
            const { correctness: githubCorrectness, latency: githubLatency } = await calculateGitHubCorrectness(owner, repo.split('.git')[0], process.env.GITHUB_TOKEN || '');
            
            // Calculate latency for npm correctness
            const end = performance.now(); // Record end time
            const latency = end - start; // Calculate latency

            // Return combined results
            return { correctness: githubCorrectness, latency: latency + githubLatency }; // Add latencies if needed

        }

        log(`Could not find GitHub repository URL for ${packageName}, assuming correctness to be 1`, 1); // Info
        const end = performance.now(); // Record end time if no GitHub repo is found
        const latency = end - start; // Calculate latency
        return { correctness: 1, latency }; // If no GitHub repo is found, assume correctness is perfect

    } catch (error) {
        let errorMessage = "Failed to calculate correctness for npm package";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        log(`Error: ${errorMessage}`, 1); // Info
        
        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency
        
        // Return default values for correctness and latency in case of error
        return { correctness: -1, latency };
    }
};
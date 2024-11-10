import axios from 'axios';
import { log } from './logging.js';

export const calculateCodeReviewMetric = async (owner: string, repo: string, githubToken: string): Promise<{ score: number, latency: number }> => {
    const start = performance.now(); // Record start time

    try {
        // Fetch repository information to get total lines of code
        const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: { Authorization: `token ${githubToken}` },
        });
        const totalLOC = repoResponse.data.size; // Assuming size is the total LOC; may need adjustments

        // If there are no lines of code, return a perfect score
        if (totalLOC === 0) {
            const latency = performance.now() - start;
            log(`Code review score for ${owner}/${repo} calculated with no code.`, 1);
            return { score: 1.0, latency };
        }

        // Fetch pull requests
        const prsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls?state=closed`, {
            headers: { Authorization: `token ${githubToken}` },
        });
        const pullRequests = prsResponse.data;

        // Count lines of code introduced through reviewed PRs
        let reviewedLOC = 0;

        for (const pr of pullRequests) {
            // Fetch reviews for each PR
            const reviewsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/reviews`, {
                headers: { Authorization: `token ${githubToken}` },
            });
            const reviews = reviewsResponse.data;

            // Check if PR has any approved reviews
            if (reviews.some((review: any) => review.state === 'APPROVED')) {
                // Fetch the diff of the PR to get lines added or changed
                const prFilesResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/files`, {
                    headers: { Authorization: `token ${githubToken}` },
                });
                const filesChanged = prFilesResponse.data;

                // Count lines added or modified
                for (const file of filesChanged) {
                    reviewedLOC += file.changes; // Assuming file.changes gives total changes (added + modified)
                }
            }
        }

        // Calculate score
        const score = reviewedLOC / totalLOC;
        const latency = performance.now() - start;
        
        log(`Code review score for ${owner}/${repo} calculated: ${score.toFixed(2)} with latency: ${latency.toFixed(2)} ms`, 1);
        return { score, latency };

    } catch (error) {
        log(`Error fetching data for ${owner}/${repo}: ${error}`, 2);
        return { score: 0, latency: 0 };
    }
};

export const calculateNpmCodeReview = async (packageName: string): Promise<{ score: number; latency: number }> => {
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
            log(`Found GitHub repository URL for ${packageName}, calculating code review metric for GitHub repository`, 1); // Info
            const [owner, repo] = repoUrl.split('github.com/')[1].split('/');

            // Calculate code review metric using the previously defined function
            const { score: codeReviewScore, latency: githubLatency } = await calculateCodeReviewMetric(owner, repo.split('.git')[0], process.env.GITHUB_TOKEN || '');

            // Calculate latency for npm code review metric
            const end = performance.now(); // Record end time
            const latency = end - start; // Calculate latency

            // Return combined results
            return { score: codeReviewScore, latency: latency + githubLatency }; // Add latencies if needed
        }

        log(`Could not find GitHub repository URL for ${packageName}, assuming code review score to be 0`, 1); // Info
        const end = performance.now(); // Record end time if no GitHub repo is found
        const latency = end - start; // Calculate latency
        return { score: 0, latency }; // If no GitHub repo is found, assume code review score is 0

    } catch (error) {
        let errorMessage = "Failed to calculate code review metric for npm package";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        log(`Error: ${errorMessage}`, 1); // Info

        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency

        // Return default values for code review metric and latency in case of error
        return { score: -1, latency };
    }
};

import axios from 'axios';
import { log } from './logging.js'; // Assuming there's a logging utility

const GITHUB_API_BASE = 'https://api.github.com';

// Helper function to get the response time of a GitHub issue
async function getGitIssueResponseTime(issueNumber: number, owner: string, repo: string, token: string): Promise<number> {
    const issueUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}`;
    try {
        log(`Fetching issue ${issueNumber} from ${owner}/${repo}`, 2); // Debug level log
        const response = await axios.get(issueUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const issueData = response.data;
        const createdAt = new Date(issueData.created_at).getTime();
        const closedAt = issueData.closed_at ? new Date(issueData.closed_at).getTime() : Date.now();

        const responseTime = closedAt - createdAt; // Time in milliseconds
        log(`Response time for issue ${issueNumber}: ${responseTime / (1000 * 60 * 60 * 24)} days`, 2);
        return responseTime / (1000 * 60 * 60 * 24); // Convert to days

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`Error fetching issue ${issueNumber}: ${errorMessage}`, 1); // Error level log
        return 0; // Return 0 for invalid response times
    }
}

// Helper function to get all issues and PR numbers from GitHub
async function getGitIssuesAndPRs(state: string = 'all', owner: string, repo: string, token: string): Promise<number[]> {
    const issueNumbers: number[] = [];
    let page = 1;
    const perPage = 100;

    while (page < 2) {
        const issuesUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}`;
        try {
            log(`Fetching issues from ${owner}/${repo}, page ${page}`, 2); // Debug level log
            const response = await axios.get(issuesUrl, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const issues = response.data;
            if (issues.length === 0) break; // Exit loop if no more issues

            issueNumbers.push(...issues.map((issue: any) => issue.number));
            page++;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log(`Error fetching issues for ${owner}/${repo}: ${errorMessage}`, 1); // Error level log
            break; // Exit loop if there's a failure, e.g., 403 Forbidden
        }
    }

    log(`Found ${issueNumbers.length} issues for ${owner}/${repo}`, 2); // Debug level log
    return issueNumbers;
}

// Function to calculate responsiveness based on GitHub issues
export const calculateGitResponsiveness = async function (owner: string, repo: string, token: string): Promise<[number, number]> {
    const start = performance.now();
    try {
        log(`Calculating GitHub responsiveness for ${owner}/${repo}`, 1); // Info level log
        const issuesAndPRs = await getGitIssuesAndPRs('all', owner, repo, token);

        // Use Promise.all to fetch response times in parallel
        const responseTimes = await Promise.all(
            issuesAndPRs.map((issueNumber) => getGitIssueResponseTime(issueNumber, owner, repo, token))
        );

        // Filter out invalid response times and calculate metrics
        const validResponseTimes = responseTimes.filter((rt) => rt > 0);

        const end = performance.now();
        const latency = end - start;

        if (validResponseTimes.length === 0) {
            log('No valid response times found.', 2); // Debug level log
            return [0, latency];
        }

        const averageResponseTime = validResponseTimes.reduce((sum, rt) => sum + rt, 0) / validResponseTimes.length;
        let maxResponseTime = Math.max(...validResponseTimes);
        maxResponseTime = Math.max(maxResponseTime, 365);
        const responsiveness = 1 - averageResponseTime / maxResponseTime;
        log(`Responsiveness for ${owner}/${repo}: ${responsiveness}`, 1); // Info level log

        return [responsiveness, latency];
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`Error calculating responsiveness for ${owner}/${repo}: ${errorMessage}`, 1); // Error level log
        return [0, performance.now() - start];
    }
};

// Function to calculate responsiveness for npm packages
export const calculateNpmResponsiveness = async (packageName: string): Promise<{ responsiveness: number; latency: number }> => {
    const start = performance.now(); // Record start time
    try {
        log(`Fetching download stats for npm package ${packageName}`, 2); // Debug level log
        const response = await axios.get(`https://api.npmjs.org/downloads/point/last-month/${packageName}`);
        const downloadCount = response.data.downloads;

        log(`Download count for ${packageName}: ${downloadCount}`, 2); // Debug level log

        // Fetch bugs from the GitHub repository of the npm package if available
        const packageResponse = await axios.get(`https://registry.npmjs.org/${packageName}`);
        const repoUrl = packageResponse.data.repository?.url;

        if (repoUrl && repoUrl.includes('github.com')) {
            log(`Found GitHub repository for ${packageName}: ${repoUrl}`, 2); // Debug level log
            const [owner, repo] = repoUrl.split('github.com/')[1].split('/');
            const result = await calculateGitResponsiveness(owner, repo.split('.git')[0], process.env.GITHUB_TOKEN || '');

            const end = performance.now(); // Record end time
            const latency = end - start; // Calculate latency
            log(`Responsiveness for npm package ${packageName}: ${result[0]}`, 1); // Info level log
            return { responsiveness: result[0], latency };
        }

        const end = performance.now(); // Record end time if no GitHub repo is found
        const latency = end - start; // Calculate latency
        log(`No GitHub repository found for ${packageName}, assuming perfect responsiveness`, 1); // Info level log
        return { responsiveness: 1, latency }; // If no GitHub repo is found, assume responsiveness is perfect
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`Error calculating npm responsiveness for package ${packageName}: ${errorMessage}`, 1); // Error level log
        const end = performance.now(); // Record end time in case of error
        const latency = end - start; // Calculate latency
        return { responsiveness: -1, latency }; // Return default values in case of error
    }
};

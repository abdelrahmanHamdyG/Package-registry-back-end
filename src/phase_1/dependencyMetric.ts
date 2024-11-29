import axios from 'axios';
import { log } from './logging.js';

export const calculateDependencyMetric = async (owner: string, repo: string, githubToken: string): Promise<{ score: number, latency: number }> => {
    const start = performance.now(); // Record start time

    try {
        // Fetch the package.json file from GitHub
        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`, {
            headers: { Authorization: `token ${githubToken}` },
        });

        // Parse package.json content
        const packageJson = response.data;
        const dependencies = packageJson.dependencies || {};
        const devDependencies = packageJson.devDependencies || {};
        const allDependencies = { ...dependencies, ...devDependencies };
        const totalDependencies = Object.keys(allDependencies).length;

        // If there are no dependencies, return a perfect score
        if (totalDependencies === 0) {
            const latency = performance.now() - start;
            console.log(`Dependency score for ${owner}/${repo} calculated with no dependencies.`, 1); // Info level
            return { score: 1.0, latency };
        }

        // Count dependencies pinned to a specific major+minor version (x.y.z format)
        let pinnedCount = 0;
        const versionPattern = /^\d+\.\d+\.\d+$/;

        for (const version of Object.values(allDependencies)) {
            if (versionPattern.test(version as string)) {
                pinnedCount++;
            }
        }

        // Calculate the score
        const score = pinnedCount / totalDependencies;
        const latency = performance.now() - start;

        console.log(`Dependency score for ${owner}/${repo} calculated: ${score.toFixed(2)} with latency: ${latency.toFixed(2)} ms`, 1); // Info level
        return { score, latency };

    } catch (error) {
        console.log(`Error fetching package.json for ${owner}/${repo}: ${error}`, 2); // Error level
        
        return { score: 0, latency: 0 }; // Default return values in case of error
    }
};

export const calculateNpmDependency = async (packageName: string): Promise<{ score: number; latency: number }> => {
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
            log(`Found GitHub repository URL for ${packageName}, calculating Dependency metric for GitHub repository`, 1); // Info level
            const [owner, repo] = repoUrl.split('github.com/')[1].split('/');
            const { score, latency: githubLatency } = await calculateDependencyMetric(owner, repo.replace('.git', ''), process.env.GITHUB_TOKEN || '');

            // Calculate total latency for npm dependency metric
            const end = performance.now();
            const latency = end - start + githubLatency; // Sum latencies if needed

            return { score, latency };

        } else {
            log(`Could not find GitHub repository URL for ${packageName}, assuming dependency score to be 0`, 1); // Info level
            const end = performance.now();
            const latency = end - start;
            return { score: 0, latency };
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log(`Error calculating dependency metric for npm package ${packageName}: ${errorMessage}`, 1); // Info level

        const end = performance.now();
        const latency = end - start;

        // Return default values for dependency metric and latency in case of error
        return { score: -1, latency };
    }
};

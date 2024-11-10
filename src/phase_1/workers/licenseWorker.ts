import { parentPort, workerData } from 'worker_threads';
import  { calculateGitHubLicenseMetric, calculateNpmLicenseMetric } from '../License_Check.js';

(async () => {
    if (workerData.type === 'npm') {
        const result = await calculateNpmLicenseMetric(workerData.packageName);
        if (parentPort)
            parentPort.postMessage(result);
    } else if (workerData.type === 'github') {
        const result = await calculateGitHubLicenseMetric(workerData.owner, workerData.repo, process.env.GITHUB_TOKEN || '');
        if (parentPort)
            parentPort.postMessage(result);
    }
})();
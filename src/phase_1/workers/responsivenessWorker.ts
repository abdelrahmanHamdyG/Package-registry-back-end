import { parentPort, workerData } from 'worker_threads';
import {calculateGitResponsiveness,calculateNpmResponsiveness}from '../responsivenessMetric.js';

(async () => {
    if (workerData.type === 'npm') {
        const result = await calculateNpmResponsiveness(workerData.packageName);
        if (parentPort)
            parentPort.postMessage(result);
    } else if (workerData.type === 'github') {
        const result = await calculateGitResponsiveness(workerData.owner, workerData.repo, process.env.GITHUB_TOKEN || '');
        if (parentPort)
            parentPort.postMessage(result);
    }
})();
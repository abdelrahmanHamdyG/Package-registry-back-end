import { parentPort, workerData } from 'worker_threads';
import { calculateNpmCorrectness, calculateGitHubCorrectness } from '../correctnessMetric.js';


(async () => {
    if (workerData.type === 'npm') {
        const result = await calculateNpmCorrectness(workerData.packageName);
        if (parentPort)
            parentPort.postMessage(result);
    } else if (workerData.type === 'github') {
        const result = await calculateGitHubCorrectness(workerData.owner, workerData.repo, process.env.GITHUB_TOKEN || '');
        if (parentPort)
            parentPort.postMessage(result);
    }
})();
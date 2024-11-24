import  { parentPort, workerData } from 'worker_threads';
import  {calculateGitRampUpMetric,calculateNpmRampUpMetric} from '../rampUpMetric.js';

(async () => {
    if (workerData.type === 'npm') {
        const result = await calculateNpmRampUpMetric(workerData.packageName);
        if (parentPort)
            parentPort.postMessage(result);
    } else if (workerData.type === 'github') {
        const result = await calculateGitRampUpMetric(workerData.owner, workerData.repo, process.env.GITHUB_TOKEN || '');
        if (parentPort)
            parentPort.postMessage(result);
    }
})();
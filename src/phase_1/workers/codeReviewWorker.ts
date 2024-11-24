import  { parentPort, workerData } from 'worker_threads';
import  {calculateCodeReviewMetric,calculateNpmCodeReview} from '../codeReviewMetric.js';

(async () => {
    if (workerData.type === 'npm') {
        const result = await calculateNpmCodeReview(workerData.packageName);
        if (parentPort)
            parentPort.postMessage(result);
    } else if (workerData.type === 'github') {
        const result = await calculateCodeReviewMetric(workerData.owner, workerData.repo, process.env.GITHUB_TOKEN || '');
        if (parentPort)
            parentPort.postMessage(result);
    }
})();
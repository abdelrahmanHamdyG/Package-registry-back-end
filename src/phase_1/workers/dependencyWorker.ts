import  { parentPort, workerData } from 'worker_threads';
import  {calculateDependencyMetric,calculateNpmDependency} from '../dependencyMetric.js';

(async () => {
    if (workerData.type === 'npm') {
        const result = await calculateNpmDependency(workerData.packageName);
        if (parentPort)
            parentPort.postMessage(result);
    } else if (workerData.type === 'github') {
        const result = await calculateDependencyMetric(workerData.owner, workerData.repo, process.env.GITHUB_TOKEN || '');
        if (parentPort)
            parentPort.postMessage(result);
    }
})();
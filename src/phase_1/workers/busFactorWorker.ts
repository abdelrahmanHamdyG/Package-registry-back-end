import  { parentPort, workerData } from 'worker_threads';
import {calculateBusFactor,calculateNpmBusFactor} from '../BusFactor.js';

(async () => {
    try {
        let result;

        if (workerData.type === 'npm') {
            result = await calculateNpmBusFactor(workerData.packageName);
        } else if (workerData.type === 'github') {

            result = await calculateBusFactor(workerData.owner, workerData.repo, process.env.GITHUB_TOKEN || '');
        }

        if (parentPort)
            parentPort.postMessage({ success: true, data: result });
    } catch (error) {
        if (parentPort && error instanceof Error)
            parentPort.postMessage({ success: false, error: error.message });
    }
})();

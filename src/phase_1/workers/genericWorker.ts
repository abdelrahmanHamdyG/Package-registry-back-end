import { parentPort } from 'worker_threads';

if(parentPort)
parentPort.on('message', async (message) => {
  const { workerFile, data } = message;

  try {
    const workerModule = await import(workerFile);
    if (workerModule.default) {
      const result = await workerModule.default(data);
      if(parentPort)
      parentPort.postMessage(result);
    } else {
      throw new Error(`No default export found in module ${workerFile}`);
    }
  } catch (error) {
    if(parentPort&& error)
    parentPort.postMessage({ error: error});
  }
});

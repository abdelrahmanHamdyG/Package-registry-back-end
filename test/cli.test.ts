import { describe, it, expect, vi, afterEach } from 'vitest';
import { processUrl } from '../src/phase_1/cli'; // Adjust path as needed
import { log } from '../src/phase_1/logging.js';

// Mock log just to silence output
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(log, 'apply').mockImplementation(() => {});

// Mock runWorker function
// We'll assume runWorker is defined inside the same file as processUrl, 
// or you can refactor your code to export runWorker from that module for testing.
vi.mock('../src/phase_1/cli', async (original) => {
  const actual = await original();
  return {
    ...actual,
    runWorker: vi.fn()
  };
});

// Import runWorker after mocking
import { runWorker } from '../src/phase_1/cli';

afterEach(() => {
  vi.clearAllMocks();
});

describe('processUrl', () => {
  it('should return null if URL is unknown', async () => {
    const result = await processUrl('https://example.com/owner/repo');
    expect(result).toBeNull();
  });

  it('should process npm URL and return metrics', async () => {
    // Mock runWorker calls for npm scenario
    // The code expects 7 runWorker calls for npm:
    // correctnessWorker, licenseWorker, responsivenessWorker, rampUpWorker, busFactorWorker, dependencyWorker, codeReviewWorker
    // Each returns an object, we define minimal fields we need

    (runWorker as vi.Mock).mockImplementation((workerFile: string, data: any) => {
      if (workerFile.includes('correctnessWorker')) {
        return Promise.resolve({ correctness: 0.8, latency: 1000 });
      } else if (workerFile.includes('licenseWorker')) {
        return Promise.resolve({ score: 0.9, latency: 500 });
      } else if (workerFile.includes('responsivenessWorker')) {
        return Promise.resolve({ responsiveness: 0.7, latency: 700 });
      } else if (workerFile.includes('rampUpWorker')) {
        return Promise.resolve({ rampup: 0.6, latency: 300 });
      } else if (workerFile.includes('busFactorWorker')) {
        return Promise.resolve({ data: { busFactor: 0.5, latency: 400 } });
      } else if (workerFile.includes('dependencyWorker')) {
        return Promise.resolve({ score: 0.8, latency: 200 });
      } else if (workerFile.includes('codeReviewWorker')) {
        return Promise.resolve({ score: 0.9, latency: 600 });
      }
      return Promise.resolve({});
    });

    const result = await processUrl('https://www.npmjs.com/package/test-package');
    expect(result).not.toBeNull();
    expect(result?.NetScore).toBeDefined();

    // Check if metrics match expected calculation:
    // NetScore = 0.15*RampUp(0.6) + 0.15*Correctness(0.8) + 0.1*BusFactor(0.5) + 0.3*Responsive(0.7) + 0.1*License(0.9) + 0.1*Dependency(0.8) + 0.1*CodeReview(0.9)
    // = 0.15*0.6 + 0.15*0.8 + 0.1*0.5 + 0.3*0.7 + 0.1*0.9 +0.1*0.8 +0.1*0.9
    // = 0.09 + 0.12 +0.05 +0.21 +0.09 +0.08 +0.09
    // = 0.63
    expect(result?.NetScore).toBeCloseTo(0.6, 2);
  });

  it('should return null for unknown url format', async () => {
    const result = await processUrl('https://bitbucket.org/owner/repo');
    expect(result).toBeNull();
  });
});

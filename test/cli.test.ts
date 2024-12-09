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

afterEach(() => {
  vi.clearAllMocks();
});

describe('processUrl', () => {
  it('should return null if URL is unknown', async () => {
    const result = await processUrl('https://example.com/owner/repo');
    expect(result).toBeNull();
  });


  it('should return null for unknown url format', async () => {
    const result = await processUrl('https://bitbucket.org/owner/repo');
    expect(result).toBeNull();
  });
});

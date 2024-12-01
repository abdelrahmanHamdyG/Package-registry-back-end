import { calculateBusFactor, calculateNpmBusFactor } from '../../src/phase_1/BusFactor';
import { vi, describe, it, expect, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('Bus Factor Calculations', () => {
  const mockGithubToken = 'fake-github-token';

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateBusFactor', () => {
    it('should calculate Bus Factor successfully with contributors', async () => {
      const mockContributorsResponse = {
        data: [
          { login: 'user1', contributions: 50 },
          { login: 'user2', contributions: 50 },
        ],
      };
      (axios.get as vi.Mock).mockResolvedValueOnce(mockContributorsResponse);

      const { busFactor, latency } = await calculateBusFactor('owner', 'repo', mockGithubToken);

      expect(busFactor).toBeCloseTo(0.5); // Based on equal contributions
      expect(latency).toBeGreaterThan(0); // Latency should be positive
    });

    it('should return Bus Factor 0 when no contributors are found', async () => {
      const mockContributorsResponse = { data: [] }; // No contributors
      (axios.get as vi.Mock).mockResolvedValueOnce(mockContributorsResponse);

      const { busFactor, latency } = await calculateBusFactor('owner', 'repo', mockGithubToken);

      expect(busFactor).toBe(1); // No contributors lead to 0 Bus Factor
      expect(latency).toBeGreaterThan(0);
    });

    it('should handle errors and return Bus Factor -1', async () => {
      const mockError = new Error('GitHub API error');
      (axios.get as vi.Mock).mockRejectedValueOnce(mockError);

      const { busFactor, latency } = await calculateBusFactor('owner', 'repo', mockGithubToken);

      expect(busFactor).toBe(-1); // Error leads to -1 Bus Factor
      expect(latency).toBeGreaterThan(0);
    });
  });

  describe('calculateNpmBusFactor', () => {
    it('should calculate NPM Bus Factor successfully with valid GitHub repo', async () => {
      const mockNpmResponse = {
        data: { repository: { url: 'https://github.com/owner/repo.git' } },
      };
      const mockContributorsResponse = {
        data: [
          { login: 'user1', contributions: 40 },
          { login: 'user2', contributions: 60 },
        ],
      };

      (axios.get as vi.Mock)
        .mockResolvedValueOnce(mockNpmResponse) // Mock NPM package info
        .mockResolvedValueOnce(mockContributorsResponse); // Mock GitHub contributors

      const { busFactor, latency } = await calculateNpmBusFactor('valid-package');

      expect(busFactor).toBeCloseTo(0.48); // Based on contributions
      expect(latency).toBeGreaterThan(0);
    });

    it('should return Bus Factor 0 when no GitHub repo is found', async () => {
      const mockNpmResponse = {
        data: { repository: { url: 'https://example.com/some-repo' } }, // Non-GitHub repo
      };

      (axios.get as vi.Mock).mockResolvedValueOnce(mockNpmResponse);

      const { busFactor, latency } = await calculateNpmBusFactor('package-with-no-github');

      expect(busFactor).toBe(0); // No GitHub repo leads to 0 Bus Factor
      expect(latency).toBeGreaterThan(0);
    });

    it('should handle errors and return Bus Factor -1 for NPM package', async () => {
      const mockError = new Error('NPM API error');
      (axios.get as vi.Mock).mockRejectedValueOnce(mockError);

      const { busFactor, latency } = await calculateNpmBusFactor('invalid-package');

      expect(busFactor).toBe(-1); // Error leads to -1 Bus Factor
      expect(latency).toBeGreaterThan(0);
    });
  });
});

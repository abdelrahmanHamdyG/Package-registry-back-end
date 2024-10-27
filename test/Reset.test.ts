import { resetRegistry } from '../src/controller'; // Adjust path as needed
import { resetRegistryQuery } from '../src/queries'; // Adjust path as needed
import pool from '../src/db'; // Adjust path as needed
import { Request, Response } from 'express';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the pool and client connection
vi.mock('../src/db', async () => {
  const actual = await vi.importActual<typeof import('../src/db')>('../src/db');
  return {
    ...actual,
    default: {
      connect: vi.fn(),
    },
  };
});

// Mock the resetRegistryQuery function
vi.mock('../src/queries', () => ({
  resetRegistryQuery: vi.fn(),
}));

describe('resetRegistry', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockClient: any;

  beforeEach(() => {
    req = {}; // Mock request object
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    }; // Mock response object

    // Mock database client with query and release functions
    mockClient = {
      query: vi.fn(),
      release: vi.fn()
    };

    // Mock pool connection to return the mockClient
    (pool.connect as vi.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  
  it('should reset the registry and return 200 if the user is an admin', async () => {
    (resetRegistryQuery as vi.Mock).mockResolvedValueOnce(undefined);

    await resetRegistry(req as Request, res as Response);

    expect(pool.connect).toHaveBeenCalled();
    expect(resetRegistryQuery).toHaveBeenCalledWith(mockClient);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Registry is reset' });
  });

  it('should return 500 if there is an error resetting the registry', async () => {
    (resetRegistryQuery as vi.Mock).mockRejectedValueOnce(new Error('Query error'));

    await resetRegistry(req as Request, res as Response);

    expect(pool.connect).toHaveBeenCalled();
    expect(resetRegistryQuery).toHaveBeenCalledWith(mockClient);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });
});

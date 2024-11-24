import { searchPackageByRegex } from '../src/controller'; // Adjust path as needed
import { searchPackagesByRegExQuery } from '../src/queries'; // Adjust path as needed
import pool from '../src/db'; // Adjust path as needed
import { Request, Response } from 'express';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the pool and DB query function
vi.mock('../src/db', async () => {
  const actual = await vi.importActual<typeof import('../src/db')>('../src/db');
  return {
    ...actual,
    default: {
      connect: vi.fn(),
    },
  };
});

vi.mock('../src/queries', () => ({
  searchPackagesByRegExQuery: vi.fn(),
}));

describe('searchPackageByRegex', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockClient: any;

  beforeEach(() => {
    req = { body: { RegEx: 'test' } }; // Mock request with a RegEx parameter
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }; // Mock response object

    // Mock database client with query and release functions
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    // Mock pool connection to return the mockClient
    (pool.connect as vi.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return package metadata when packages are found', async () => {
    // Mock database query result
    (searchPackagesByRegExQuery as vi.Mock).mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'Test Package 1', version: '1.0.0' },
        { id: 2, name: 'Test Package 2', version: '2.0.0' },
      ],
    });

    // Call the function
    await searchPackageByRegex(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(searchPackagesByRegExQuery).toHaveBeenCalledWith(mockClient, 'test'); // Check query execution
    expect(res.status).toHaveBeenCalledWith(200); // Verify status
    expect(res.json).toHaveBeenCalledWith([
      {
        metadata: {
          Name: 'Test Package 1',
          Version: '1.0.0',
          ID: 1,
        },
      },
      {
        metadata: {
          Name: 'Test Package 2',
          Version: '2.0.0',
          ID: 2,
        },
      },
    ]); // Verify response JSON
  });

  it('should return 404 if no packages are found', async () => {
    // Mock empty database result (no rows)
    (searchPackagesByRegExQuery as vi.Mock).mockResolvedValueOnce({ rows: [] });

    await searchPackageByRegex(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(searchPackagesByRegExQuery).toHaveBeenCalledWith(mockClient, 'test'); // Check query execution
    expect(res.status).toHaveBeenCalledWith(404); // Verify 404 status
    expect(res.json).toHaveBeenCalledWith({ error: 'No package found under this regex' }); // Verify error response
  });

  it('should return 400 if RegEx is missing from the request', async () => {
    req.body = {}; // Set up the request without RegEx

    await searchPackageByRegex(req as Request, res as Response);

    // Assertions
    expect(res.status).toHaveBeenCalledWith(400); // Verify 400 status
    expect(res.json).toHaveBeenCalledWith({
      error: 'There is missing field(s) in the PackageRegEx or it is formed improperly, or is invalid',
    }); // Verify error message
  });

  it('should return 500 if there is an error in searching', async () => {
    // Simulate error during query execution
    (searchPackagesByRegExQuery as vi.Mock).mockRejectedValueOnce(new Error('Query error'));

    await searchPackageByRegex(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(res.status).toHaveBeenCalledWith(500); // Verify 500 status
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' }); // Verify error response
  });
});

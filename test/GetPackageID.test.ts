import { getPackageByID } from '../src/controller'; // Adjust path as needed
import { getPackageByIDQuery } from '../src/queries'; // Adjust path as needed
import { downloadFromS3 } from '../src/s3'; // Adjust path as needed
import pool from '../src/db'; // Adjust path as needed
import { Request, Response } from 'express';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the pool, S3 download function, and DB query function
vi.mock('../src/db', async () => {
  const actual = await vi.importActual<typeof import('../src/db')>('../src/db');
  return {
    ...actual,
    default: {
      connect: vi.fn(),
    },
  };
});

// Make sure this matches the correct path for `getPackageByIDQuery`
vi.mock('../src/queries', () => ({
  getPackageByIDQuery: vi.fn(), // Ensure this is a mock function
}));

vi.mock('../src/s3', () => ({
  downloadFromS3: vi.fn(),
}));

describe('getPackageByID', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockClient: any;

  beforeEach(() => {
    req = { params: { id: '123' } }; // Mock request object with an ID parameter
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

  it('should return package data when package exists', async () => {
    // Mock database query result
    (getPackageByIDQuery as vi.Mock).mockResolvedValueOnce({
      rows: [{
        id: 123,
        name: 'Test Package',
        version: '1.0.0',
        debloat: false,
        js_program: 'console.log("Test");',
        url: 'https://example.com',
      }],
    });

    // Mock S3 download function
    (downloadFromS3 as vi.Mock).mockResolvedValueOnce(Buffer.from('mocked zip file content'));

    // Call the function
    await getPackageByID(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(getPackageByIDQuery).toHaveBeenCalledWith(mockClient, 123); // Check query execution
    expect(downloadFromS3).toHaveBeenCalledWith('packages/123.zip'); // Verify S3 download

    expect(res.status).toHaveBeenCalledWith(200); // Verify status
    expect(res.json).toHaveBeenCalledWith({
      metadata: {
        Name: 'Test Package',
        Version: '1.0.0',
        ID: 123,
      },
      data: {
        Content: Buffer.from('mocked zip file content').toString('base64'),
        JSProgram: 'console.log("Test");',
        debloat: false,
        URL: 'https://example.com',
      },
    }); // Verify response JSON
  });

  it('should return 404 if package does not exist', async () => {
    // Mock empty database result (no rows)
    (getPackageByIDQuery as vi.Mock).mockResolvedValueOnce({ rows: [] });

    await getPackageByID(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(getPackageByIDQuery).toHaveBeenCalledWith(mockClient, 123); // Check query execution
    expect(res.status).toHaveBeenCalledWith(404); // Verify 404 status
    expect(res.json).toHaveBeenCalledWith({ error: "Package doesn't exist" }); // Verify error response
  });

  it('should return 500 if there is an error', async () => {
    // Simulate error during query execution
    (getPackageByIDQuery as vi.Mock).mockRejectedValueOnce(new Error('Query error'));

    await getPackageByID(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(getPackageByIDQuery).toHaveBeenCalledWith(mockClient, 123); // Check query execution
    expect(res.status).toHaveBeenCalledWith(500); // Verify 500 status
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' }); // Verify error response
  });
});

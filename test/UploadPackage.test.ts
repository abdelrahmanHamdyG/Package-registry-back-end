import { uploadPackage } from '../src/controller'; // Adjust path as needed
import { insertPackageQuery, insertIntoPackageData, insertPackageRating } from '../src/queries'; // Adjust path as needed
import { uploadBase64ToS3 } from '../src/s3'; // Adjust path as needed
import pool from '../src/db'; // Adjust path as needed
import { Request, Response } from 'express';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the pool, S3 upload function, DB queries, and file system functions
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
  insertPackageQuery: vi.fn(),
  insertIntoPackageData: vi.fn(),
  insertPackageRating: vi.fn(),
}));

vi.mock('../src/s3', () => ({
  uploadBase64ToS3: vi.fn(),
}));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('mocked zip file content')),
  rmSync: vi.fn(),
}));

describe('uploadPackage', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockClient: any;

  beforeEach(() => {
    req = {
      body: {
        Name: 'Test Package',
        Content: 'mockedBase64Content',
        JSProgram: 'console.log("Test");',
        debloat: false,
        URL: '',
      },
    }; // Mock request with body parameters
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

  // it('should upload package successfully when Content is provided', async () => {
  //   // Mock database query results
  //   (insertPackageQuery as vi.Mock).mockResolvedValueOnce({
  //     rows: [{ id: 123 }],
  //   });

  //   // Mock S3 upload function
  //   (uploadBase64ToS3 as vi.Mock).mockResolvedValueOnce(undefined);

  //   // Call the function
  //   await uploadPackage(req as Request, res as Response);

  //   // Assertions
  //   expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
  //   expect(insertPackageQuery).toHaveBeenCalledWith(mockClient, 'Test Package', '1.0.0'); // Check package insert
  //   expect(uploadBase64ToS3).toHaveBeenCalledWith('mockedBase64Content', 'packages/123.zip'); // Verify S3 upload
  //   expect(insertIntoPackageData).toHaveBeenCalledWith(mockClient, 123, '', '', false, 'console.log("Test");'); // Verify package data insert
  //   expect(insertPackageRating).toHaveBeenCalledWith(mockClient, 123); // Verify package rating insert
  //   expect(res.status).toHaveBeenCalledWith(201); // Verify status
  //   expect(res.json).toHaveBeenCalledWith({
  //     metadata: {
  //       Name: 'Test Package',
  //       Version: '1.0.0',
  //       ID: 123,
  //     },
  //     data: {
  //       Content: 'mockedBase64Content',
  //       JSProgram: 'console.log("Test");',
  //     },
  //   }); // Verify response JSON
  // });

  it('should return 400 if Content and URL are both provided', async () => {
    req.body = {
      Name: 'Test Package',
      Content: 'mockedBase64Content',
      URL: 'https://example.com',
      JSProgram: 'console.log("Test");',
      debloat: false,
    };

    await uploadPackage(req as Request, res as Response);

    // Assertions
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)',
    });
  });

  // it('should handle error and return 500 on database failure', async () => {
  //   // Simulate database error
  //   (insertPackageQuery as vi.Mock).mockRejectedValueOnce(new Error('Database error'));

  //   await uploadPackage(req as Request, res as Response);

  //   // Assertions
  //   expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
  //   expect(res.status).toHaveBeenCalledWith(500); // Verify status
  //   expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' }); // Verify error response
  // });
});

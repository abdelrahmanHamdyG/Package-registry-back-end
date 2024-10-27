import { updatePackage } from '../src/controller';
import { getNameVersionById, getlatestVersionByID, insertPackageQuery, insertIntoPackageData } from '../src/queries';
import { uploadBase64ToS3 } from '../src/s3';
import pool from '../src/db';
import { Request, Response } from 'express';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the pool, S3 upload function, DB queries, and file system functions
vi.mock('../src/db', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      connect: vi.fn(),
    },
  };
});

vi.mock('../src/queries', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getNameVersionById: vi.fn(),
    getlatestVersionByID: vi.fn(),
    insertPackageQuery: vi.fn(),
    insertIntoPackageData: vi.fn(), // Now added to the mock
  };
});

vi.mock('../src/s3', () => ({
  uploadBase64ToS3: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('mocked zip file content')),
    rmSync: vi.fn(),
  };
});

describe('updatePackage', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockClient: any;

  beforeEach(() => {
    req = {
      params: { id: 123 }, // Use a number here to match the expected type
      body: {
        metadata: { Name: 'Test Package', Version: '1.1.0' },
        data: { Content: 'mockedBase64Content', JSProgram: 'console.log("Test");', debloat: false, URL: '' },
      },
    }; // Mock request with parameters and body
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

  it('should update package successfully when Content is provided and version is latest', async () => {
    // Mock database query results
    (getNameVersionById as vi.Mock).mockResolvedValueOnce({
      rows: [{ name: 'Test Package' }],
    });
    (getlatestVersionByID as vi.Mock).mockResolvedValueOnce({
      rows: [{ maxversion: '1.0.0' }],
    });
    (insertPackageQuery as vi.Mock).mockResolvedValueOnce({
      rows: [{ id: 124 }],
    });
    (uploadBase64ToS3 as vi.Mock).mockResolvedValueOnce(undefined);
    (insertIntoPackageData as vi.Mock).mockResolvedValueOnce({}); // Mock insertIntoPackageData response

    // Call the function
    await updatePackage(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(getNameVersionById).toHaveBeenCalledWith(mockClient, 123); // Check name/version retrieval
    expect(getlatestVersionByID).toHaveBeenCalledWith(mockClient, 123); // Check latest version retrieval
    expect(insertPackageQuery).toHaveBeenCalledWith(mockClient, 'Test Package', '1.1.0'); // Check package insertion
    expect(uploadBase64ToS3).toHaveBeenCalledWith('mockedBase64Content', 'packages/124.zip'); // Verify S3 upload
    expect(res.status).toHaveBeenCalledWith(201); // Verify status
    expect(res.json).toHaveBeenCalledWith({
      metadata: {
        Name: 'Test Package',
        Version: '1.1.0',
        ID: 124,
      },
      data: {
        Content: 'mockedBase64Content',
        JSProgram: 'console.log("Test");',
      },
    }); // Verify response JSON
  });

  it('should return 400 if Content and URL are both provided', async () => {
    // Mock request with both Content and URL provided
    req.body = {
      metadata: { Name: 'Test Package', Version: '1.1.0' },
      data: { Content: 'mockedBase64Content', URL: 'https://example.com', JSProgram: 'console.log("Test");', debloat: false },
    };

    // Mock necessary queries to avoid undefined rows
    (getNameVersionById as vi.Mock).mockResolvedValueOnce({
      rows: [{ name: 'Test Package' }],
    });
    (getlatestVersionByID as vi.Mock).mockResolvedValueOnce({
      rows: [{ maxversion: '1.0.0' }],
    });

    await updatePackage(req as Request, res as Response);

    // Assertions
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)',
    });
  });

  it('should handle error and return 500 on database failure', async () => {
    // Mock necessary queries with expected structure
    (getNameVersionById as vi.Mock).mockResolvedValueOnce({
      rows: [{ name: 'Test Package' }],
    });
    (getlatestVersionByID as vi.Mock).mockResolvedValueOnce({
      rows: [{ maxversion: '1.0.0' }],
    });

    // Simulate database error in `insertPackageQuery`
    (insertPackageQuery as vi.Mock).mockRejectedValueOnce(new Error('Database error'));

    await updatePackage(req as Request, res as Response);

    // Assertions
    expect(pool.connect).toHaveBeenCalled(); // Verify pool connection
    expect(res.status).toHaveBeenCalledWith(500); // Verify status
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' }); // Verify error response
  });

});

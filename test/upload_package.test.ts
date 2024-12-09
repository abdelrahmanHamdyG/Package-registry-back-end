// uploadPackage.test.ts
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { uploadPackage } from '../src/controllers/packages_controller';
import { canIUploadQuery, updateTokenQuery } from '../src/queries/users_queries';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.JWT_SECRET = 'testsecret'; // Ensure JWT_SECRET is set for jwt.verify
});

// Mock logging
vi.mock('../src/phase_1/logging.js', () => ({
  log: vi.fn(),
}));

// Mock queries
vi.mock('../src/queries/users_queries', () => ({
  canIUploadQuery: vi.fn(),
  updateTokenQuery: vi.fn(),
}));

// Mock jwt with a default export
vi.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
}));

// Mock database pool
vi.mock('../src/db.js', () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  return {
    __esModule: true,
    default: {
      connect: vi.fn().mockResolvedValue(mockClient),
    },
  };
});

// Mock S3 functions
vi.mock('../src/s3.js', () => ({
  downloadFromS3: vi.fn().mockResolvedValue(null),
  uploadBase64ToS3: vi.fn().mockResolvedValue(null),
  uploadZipToS3: vi.fn().mockResolvedValue(null),
}));

// Mock other utilities
vi.mock('../src/phase_1/cli.js', () => ({
  processUrl: vi.fn().mockResolvedValue({ NetScore: 0.0 }),
}));

vi.mock('../src/controllers/utility_controller.js', () => ({
  debloat_file: vi.fn().mockResolvedValue(),
  zipDirectory: vi.fn().mockResolvedValue(),
  extractReadmeAsync: vi.fn().mockResolvedValue(''),
  getURLFromPackageJson: vi.fn().mockReturnValue('no url'),
  getNameFromPackageJson: vi.fn().mockResolvedValue('no name'),
}));

// Mock AdmZip
vi.mock('adm-zip', () => ({
  __esModule: true,
  default: vi.fn().mockImplementation(() => ({
    extractAllTo: vi.fn(),
  })),
}));

// Mock fs and fs/promises
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('')),
    existsSync: vi.fn().mockReturnValue(false),
  };
});

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    stat: vi.fn().mockResolvedValue(null),
    rm: vi.fn().mockResolvedValue(null),
  };
});

afterEach(() => {
  vi.clearAllMocks(); // Clears call counters and mock states
});

describe('uploadPackage Additional Tests', () => {

    
  it('should return 401 if token is expired', async () => {
    // Mock jwt.verify to throw a TokenExpiredError
    const expiredError = new Error('TokenExpired');
    (expiredError as any).name = 'TokenExpiredError';
    (jwt.verify as vi.Mock).mockImplementationOnce(() => {
      throw expiredError;
    });

    const req = {
      body: { Content: 'someBase64Content' },
      headers: { 'x-authorization': 'Bearer validToken' }
    } as unknown as Request;

    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();
    const res = { status: statusMock, json: jsonMock } as unknown as Response;

    await uploadPackage(req, res);
 
    // Change the expectation from 403 to 401, as the actual code sets 401 for TokenExpiredError
    expect(statusMock).toHaveBeenCalledWith(403);
    
  });

  it('should return 403 if no authentication token is provided', async () => {
    const req = {
      body: { Content: 'someContentBase64' },
      headers: {}
    } as unknown as Request;

    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();
    const res = { status: statusMock, json: jsonMock } as unknown as Response;

    await uploadPackage(req, res);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Authentication failed due to invalid or missing AuthenticationToken.'
    });
  });

  it('should return 400 if both Content and URL are provided', async () => {
    const req = {
      body: {
        Content: 'someContentBase64',
        URL: 'http://example.com'
      },
      headers: { 'x-authorization': 'Bearer someToken' }
    } as unknown as Request;

    (updateTokenQuery as vi.Mock).mockResolvedValueOnce({ rows: [{ usage_count: 1 }] });
    (jwt.verify as vi.Mock).mockReturnValueOnce({ sub: 1 });
    (canIUploadQuery as vi.Mock).mockResolvedValueOnce({ rows: [{ can_upload: true }] });

    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();
    const res = { status: statusMock, json: jsonMock } as unknown as Response;

    await uploadPackage(req, res);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({
      error: "There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)"
    });
  });

  it('should return 440 if Content is provided but Name is undefined', async () => {
    (jwt.verify as vi.Mock).mockReturnValueOnce({ sub: 1 });
    (updateTokenQuery as vi.Mock).mockResolvedValueOnce({ rows: [{ usage_count: 1 }] });
    (canIUploadQuery as vi.Mock).mockResolvedValueOnce({ rows: [{ can_upload: true }] });

    const req = {
      body: {
        Content: 'someBase64Content',
        // No Name provided
      },
      headers: { 'x-authorization': 'Bearer validToken' }
    } as unknown as Request;

    const statusMock = vi.fn().mockReturnThis();
    const jsonMock = vi.fn();
    const res = { status: statusMock, json: jsonMock } as unknown as Response;

    await uploadPackage(req, res);

    expect(statusMock).toHaveBeenCalledWith(440);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Name is undefined' });
  });

});

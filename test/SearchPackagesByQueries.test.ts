import { searchPackagesByQueries } from '../src/controller'; // Adjust path as needed
import pool from '../src/db'; // Adjust path as needed
import { Request, Response } from 'express';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../src/db', async () => {
  const actual = await vi.importActual<typeof import('../src/db')>('../src/db');
  return {
    ...actual,
    default: {
      query: vi.fn(), // Mock the query method explicitly
    },
  };
});

describe('searchPackagesByQueries', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockJson: vi.Mock;
  let mockSetHeader: vi.Mock;

  beforeEach(() => {
    mockJson = vi.fn();
    mockSetHeader = vi.fn();
    res = {
      status: vi.fn().mockReturnThis(),
      json: mockJson,
      setHeader: mockSetHeader,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should search all packages with wildcard (*)', async () => {
    req = {
      body: [{ Name: '*', Version: '1.0.0' }],
      query: { offset: '0' },
    };

    (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [{ id: 1, name: 'Package A', version: '1.0.0' }] });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE TRUE'), expect.arrayContaining([10, 0]));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ packages: [{ id: 1, name: 'Package A', version: '1.0.0' }] });
    expect(res.setHeader).toHaveBeenCalledWith('offset', 10);
  });

  it('should handle version with ~ (minor version compatibility)', async () => {
    req = {
      body: [{ Name: 'Test Package', Version: '~1.2' }],
      query: { offset: '0' },
    };

    (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [{ id: 2, name: 'Test Package', version: '1.2.3' }] });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('(name = $1 AND version >= $2 AND version < $3)'),
      expect.arrayContaining(['Test Package', '1.2.0', '1.3.0', 10, 0])
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ packages: [{ id: 2, name: 'Test Package', version: '1.2.3' }] });
    expect(res.setHeader).toHaveBeenCalledWith('offset', 10);
  });

  it('should handle version with ^ (major version compatibility)', async () => {
    req = {
      body: [{ Name: 'Sample Package', Version: '^2' }],
      query: { offset: '10' },
    };

    (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [{ id: 3, name: 'Sample Package', version: '2.1.0' }] });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('(name = $1 AND version >= $2 AND version < $3)'),
      expect.arrayContaining(['Sample Package', '2.0.0', '3.0.0', 10, 10])
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ packages: [{ id: 3, name: 'Sample Package', version: '2.1.0' }] });
    expect(res.setHeader).toHaveBeenCalledWith('offset', 20);
  });

  it('should handle version with range (e.g., 1.0.0 - 2.0.0)', async () => {
    req = {
      body: [{ Name: 'Range Package', Version: '1.0.0 - 2.0.0' }],
      query: { offset: '20' },
    };

    (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [{ id: 4, name: 'Range Package', version: '1.5.0' }] });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('(name = $1 AND version >= $2 AND version <= $3)'),
      expect.arrayContaining(['Range Package', '1.0.0', '2.0.0', 10, 20])
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ packages: [{ id: 4, name: 'Range Package', version: '1.5.0' }] });
    expect(res.setHeader).toHaveBeenCalledWith('offset', 30);
  });

  it('should handle exact version search', async () => {
    req = {
      body: [{ Name: 'Exact Package', Version: '2.3.4' }],
      query: { offset: '0' },
    };

    (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [{ id: 5, name: 'Exact Package', version: '2.3.4' }] });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('(name = $1 AND version = $2)'),
      expect.arrayContaining(['Exact Package', '2.3.4', 10, 0])
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ packages: [{ id: 5, name: 'Exact Package', version: '2.3.4' }] });
    expect(res.setHeader).toHaveBeenCalledWith('offset', 10);
  });

  it('should return 500 on database error', async () => {
    req = {
      body: [{ Name: 'Error Package', Version: '1.0.0' }],
      query: { offset: '0' },
    };

    (pool.query as vi.Mock).mockRejectedValueOnce(new Error('Database error'));

    await searchPackagesByQueries(req as Request, res as Response);

    expect(pool.query).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

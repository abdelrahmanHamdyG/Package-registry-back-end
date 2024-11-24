import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Pool, PoolClient } from 'pg';
import {
  getPackageByIDQuery,//1 Must Be Done (Done)
  //getPackageByNameQuery,
  //updatePackageByIDQuery,
  //updatePackageVersionMetricsQuery,
  //deletePackageByIDQuery,
  //deletePackageVersionsByPackageIDQuery,
  insertPackageQuery,//2 Must Be Done (Done)
  //searchPackagesQuery,
  resetRegistryQuery,//3 Must Be Done (Done)
  //getPackageRatingQuery,
  searchPackagesByRegExQuery,//4 Must Be Done (Done)
  insertIntoPackageData,//5 Must Be Done (Done)
  insertPackageRating,//6 Must Be Done (Done)
  
  getNameVersionById//8 Must Be Done ()
} from '../src/queries';

// Mock the pg module entirely to prevent any real connections
vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Pool: vi.fn(() => ({
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
      options: { ssl: false }, // Ensuring SSL is disabled in the mock for testing
    })),
  };
});

const pool = new Pool();

describe('Query Tests', () => {
  let mockClient: vi.Mocked<PoolClient>;

  afterEach(() => {
    vi.clearAllMocks(); // Clear previous mocks
  });

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),  // Mock the query function
    } as unknown as vi.Mocked<PoolClient>;
  });

  // Normalize query helper function
  const normalizeQuery = (query: string) =>
    query
      .split('\n')
      .map(line => line.trim())
      .join('\n');

  /*it('getPackageRatingQuery should call pool.query with correct SQL and parameters', async () => {
    const packageID = '123';
    const packageIDArray = [packageID];
    await getPackageRatingQuery(mockClient,packageID);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
    SELECT
      pv.correctness,
      pv.responsiveness,
      pv.ramp_up,
      pv.bus_factor,
      pv.license_metric,
      -- Assuming that other metrics are also in the same table or calculated elsewhere
      (pv.correctness + pv.responsiveness + pv.ramp_up + pv.bus_factor + pv.license_metric) / 5 AS net_score 
    FROM
      pack_version pv
    WHERE
      pv.p_id = $1
    ORDER BY
      pv.version DESC

  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
  });
*/
  it('get Name & Version by ID', async () => {
    const packageID = 123;
    const packageIDArray = [packageID];
    await getNameVersionById(mockClient,packageID);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
    SELECT 
    p.name
FROM 
    package p
WHERE 
    p.id = $1;

  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
  });

  
  it('reset the registry', async () => {
    await resetRegistryQuery(mockClient);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
    TRUNCATE package CASCADE;
  `));
  });

  it('search packages by ragex', async () => {
    const regex="test"
    await searchPackagesByRegExQuery(mockClient,regex);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
    SELECT
     id, name, version from package 
    WHERE
     name ~* $1 
  `));
  expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([regex]);
  });

  it('insert to the package', async () => {
    const package_id=123;
    const content="testing";
    const url="testing.git";
    const debloat= false;
    const js_program="tesing js_program"
    await insertIntoPackageData(mockClient,package_id,content,url,debloat,js_program);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
    INSERT INTO package_data (package_id, content, url, debloat, js_program)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([package_id,content,url,debloat,js_program]);
  });

  

  it('insert rating for the package', async () => {
    const package_id=123;
    await insertPackageRating(mockClient,package_id);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
    INSERT INTO package_rating (
      package_id, bus_factor, correctness, ramp_up, responsive_maintainer, license_score, 
      good_pinning_practice, pull_request, net_score, bus_factor_latency, 
      correctness_latency, ramp_up_latency, responsive_maintainer_latency, 
      license_score_latency, good_pinning_practice_latency, pull_request_latency, 
      net_score_latency
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 
      $7, $8, $9, $10, 
      $11, $12, $13, 
      $14, $15, $16, 
      $17
    )
  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([package_id,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]);
  });

  /*it('updatePackageVersionMetricsQuery should call pool.query with correct SQL and parameters', async () => {
    const packageID = '123';
    await deletePackageVersionsByPackageIDQuery(mockClient, packageID);
    expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM pack_version WHERE p_id = $1', [packageID]);
  });
  */
  /*it('deletePackageByIDQuery should call pool.query with correct SQL and parameters', async () => {
    const packageID = '123';
    await deletePackageByIDQuery(mockClient, packageID);
    expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM package WHERE p_id = $1 RETURNING *', [packageID]);
  });*/

  it('insertPackageQuery should call pool.query with correct SQL and parameters', async () => {
    const packageName = 'new_package';
    const version = '1.0.0';
    await insertPackageQuery(mockClient, packageName, version);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
      INSERT INTO package (name, version)
      VALUES ($1, $2)
      RETURNING *
    `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([packageName, version]);
  });

  

  /*it('updatePackageVersionMetricsQuery should call pool.query with correct SQL and parameters', async () => {
    const packageID = '123';
    const version = '1.0';
    const correctness = 0.8;
    const responsiveness = 0.8;
    const ramp_up = 0.8;
    const license_metric = 0.8;
    const bus_factor = 0.8;
    await updatePackageVersionMetricsQuery(mockClient,packageID, version, correctness, responsiveness, ramp_up, bus_factor, license_metric);
    expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(`
      UPDATE pack_version
      SET correctness = $1, responsiveness = $2, ramp_up = $3, bus_factor = $4, license_metric = $5
      WHERE p_id = $6 AND version = $7
      RETURNING *
    `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([correctness,responsiveness,
      ramp_up,
      bus_factor,
      license_metric,
      packageID,
      version,
    ]);
  });
*/
  it('getPackageByIDQuery should call pool.query with correct SQL and parameters', async () => {
    const packageID = 123;
    const packageIDArray = [packageID];
    await getPackageByIDQuery(mockClient,packageID);
    const qu=`
    SELECT 
      p.id,
      p.name,
      p.version,
      pd.debloat,
      pd.js_program,
      pd.url
    FROM 
      package p
    JOIN 
      package_data pd
    ON 
      p.id = pd.package_id
    WHERE 
      p.id = $1;

  `
  expect(normalizeQuery((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQuery(qu));
  expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
  });

  // Add more tests similarly for other functions
});

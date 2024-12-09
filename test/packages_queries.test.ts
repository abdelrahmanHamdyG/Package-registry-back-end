import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { PoolClient } from 'pg';
import pool from '../src/db.js';
import {
  getPackageByIDQuery,//1 Must Be Done (Done)
  getPackageNameByIDQuery,
  getLatestPackageQuery,
  checkPackageExistsQuery,
  insertPackageDependency,
  insertPackageRatingQuery,
  searchPackagesByRegExQueryForAdminQuery,
  getNameVersionByIdQuery,
  insertIntoPackageDataQuery,
  insertPackageQuery,//2 Must Be Done (Done)
  resetRegistryQuery,//3 Must Be Done (Done)
  getPackageRatingQuery,
  insertToPackageHistoryRatingQuery,
  insertToPackageHistoryQuery,
  getPackageDependeciesByIDQuery,
  searchPackagesByRegExQuery,//4 Must Be Done (Done)
  //insertIntoPackageData,//5 Must Be Done (Done)
  //insertPackageRating,//6 Must Be Done (Done)
 // getlatestVersionByID,//7 Must Be Done (Done)
  //getNameVersionById//8 Must Be Done ()
} from '../src/queries/packages_queries';
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
vi.mock('../src/db.js', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    }),
    query:vi.fn() 
  },
}));
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
  const normalizeQueryFlat = (query: string) =>
    query
      .split('\n')
      .map(line => line.trim())
      .join(' ') // Join with a space instead of '\n'.
      .replace(/\s+/g, ' ') // Ensure no extra spaces remain.
      .trim(); // Remove any leading or trailing spaces.
  it('getPackageRatingQuery should call pool.query with correct SQL and parameters', async () => {
    const packageID = 123;
    const packageIDArray = [packageID];
    await getNameVersionByIdQuery(mockClient,packageID);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    SELECT 
    p.name
FROM 
    package p
WHERE 
    p.id = $1;

  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
  });

  it('get Name by ID', async () => {
    const packageID = 123;
    const packageIDArray = [packageID];
    await getPackageNameByIDQuery(mockClient,packageID);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    SELECT 
    name
FROM 
    package 
WHERE 
    id = $1;
  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
  });

  it('get the latest version and url by ID', async () => {
    const packageID = 123;
    const packageIDArray = [packageID];
    await getLatestPackageQuery(mockClient,packageID);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    SELECT 
      p.version,
      pd.url
  FROM 
      package p
  JOIN 
      package_data pd ON pd.package_id = p.id
  WHERE 
      p.name = (SELECT name FROM package WHERE id = $1)
  ORDER BY 
      p.version DESC
  LIMIT 1;
  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
  });
  
  it('reset', async () => {
    // Mock query response
    (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });

    // Call the function
    await resetRegistryQuery();

    // Verify that pool.query was called with the correct query
    expect(pool.query as vi.Mock).toHaveBeenCalledWith(`
    -- Delete all data while preserving user_account with user_id = 30
    DELETE FROM package_data WHERE package_id IN (SELECT id FROM package);
    DELETE FROM package_dependencies WHERE package_id IN (SELECT id FROM package);
    DELETE FROM package_rating WHERE package_id IN (SELECT id FROM package);
    DELETE FROM package_history WHERE package_id IN (SELECT id FROM package);
    DELETE FROM package;
    DELETE FROM user_group_membership WHERE user_id != 30;
    DELETE FROM user_groups WHERE id NOT IN (SELECT group_id FROM user_group_membership);
    DELETE FROM user_tokens WHERE user_id != 30;
    DELETE FROM user_account WHERE id != 30;
  `);
  });
  
  it('search packages by ragex For admin', async () => {
    const regex="test"
    await searchPackagesByRegExQueryForAdminQuery(mockClient,regex);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    SELECT p.id, p.name, p.version
FROM package p
LEFT JOIN package_data pd ON p.id = pd.package_id
WHERE p.name ~ $1
  OR pd.readme ~ $1;
`));
  expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([regex]);
  });
  it('search packages by ragex', async () => {
    const regex="test"
    const group_id=1
    await searchPackagesByRegExQuery(mockClient,regex,group_id);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    SELECT p.id, p.name, p.version
FROM package p
LEFT JOIN package_data pd ON p.id = pd.package_id
WHERE (p.name ~ $1
  OR pd.readme ~ $1) AND (group_id IS NULL OR group_id= $2);

  `));
  expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([regex,group_id]);
  });
 
  it('insert to the package data', async () => {
    const package_id=123;
    const content="testing";
    const url="testing.git";
    const debloat= false;
    const js_program="tesing js_program"
    const readme="test readme"
    await insertIntoPackageDataQuery(mockClient,package_id,content,url,debloat,js_program,readme);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    INSERT INTO package_data (package_id, content, url, debloat, js_program,readme)
    VALUES ($1, $2, $3, $4, $5,$6)
    RETURNING *
    `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([package_id,content,url,debloat,js_program,readme]);
  });
  it('insert to the package dependencies', async () => {
    const package_id=123;
    const dependency="test dependency"
    const standalone=1.21
    const total=2.21
    await insertPackageDependency(mockClient,package_id,dependency,standalone,total);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    INSERT INTO package_dependencies (package_id, dependency,standalone_cost,total_cost)
    VALUES ($1, $2, $3,$4)
    RETURNING *;
  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([package_id,dependency,standalone,total]);
  });
  it('get the package dependencies by id', async () => {
    const package_id=123;
    await getPackageDependeciesByIDQuery(mockClient,package_id);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    select * from package_dependencies where package_id=$1;
  `));
    expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([package_id]);
  });
  it('insert to the package history', async () => {
    const package_id=123;
    const user_id=12
    const action="testing"
    await insertToPackageHistoryQuery(user_id,action,package_id,mockClient);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    INSERT INTO package_history 
    (package_id,user_id,action,action_date)
    VALUES ($1,$2,$3,$4)
    `));
  });
  
  it('insert to the package history rating', async () => {
    const package_id=123;
    const user_id=12
    const action="testing"
    const mockResult = { rows: [{ username: 'testing' }] };
    (pool.query as vi.Mock).mockResolvedValue(mockResult);
    const result = await insertToPackageHistoryRatingQuery(user_id,action,package_id);
    expect((pool.query as vi.Mock)).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO package_history' ),expect.arrayContaining([user_id,action,package_id]));
    expect(result).toEqual(mockResult)
  });
  it('insert to the package rating', async () => {
    const package_id=123;
    await insertPackageRatingQuery(mockClient,package_id);
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
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
 
  it('get rating for the package', async () => {
    const package_id=123;
    (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
    await getPackageRatingQuery(package_id);
    expect(normalizeQueryFlat((pool.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
    SELECT * 
    FROM package_rating 
    WHERE package_id = $1;
`));
    expect((pool.query as vi.Mock).mock.calls[0][1]).toEqual([package_id]);
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
    expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
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
      p.group_id,
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
  expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(qu));
  expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
  });
  // Add more tests similarly for other functions
});

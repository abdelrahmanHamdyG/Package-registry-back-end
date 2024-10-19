// queries.ts
import { PoolClient } from 'pg';
import pool from './db.js'; // Adjust the path according to your project structure

// Get package by ID
export const getPackageByIDQuery = (packageID: string) => {
  const query = `
    SELECT
      p.p_id,
      p.name,
      p.github_url,
      pv.version,
      pv.correctness,
      pv.responsiveness,
      pv.ramp_up,
      pv.bus_factor,
      pv.license_metric
    FROM
      package p
    LEFT JOIN
      pack_version pv ON p.p_id = pv.p_id
    WHERE
      p.p_id = $1
  `;
  return pool.query(query, [packageID]);
};

// Get package by Name
export const getPackageByNameQuery = (packageName: string) => {
  const query = `
    SELECT
      p.p_id,
      p.name,
      p.github_url,
      pv.version,
      pv.correctness,
      pv.responsiveness,
      pv.ramp_up,
      pv.bus_factor,
      pv.license_metric
    FROM
      package p
    LEFT JOIN
      pack_version pv ON p.p_id = pv.p_id
    WHERE
      p.name = $1
  `;
  return pool.query(query, [packageName]);
};

// Update package by ID
export const updatePackageByIDQuery = (
  packageID: string,
  name: string,
  github_url: string
) => {
  const query = `
    UPDATE package
    SET name = $1, github_url = $2
    WHERE p_id = $3
    RETURNING *
  `;
  return pool.query(query, [name, github_url, packageID]);
};

// Update package version metrics
export const updatePackageVersionMetricsQuery = (
  packageID: string,
  version: string,
  correctness: number,
  responsiveness: number,
  ramp_up: number,
  bus_factor: number,
  license_metric: number
) => {
  const query = `
    UPDATE pack_version
    SET correctness = $1, responsiveness = $2, ramp_up = $3, bus_factor = $4, license_metric = $5
    WHERE p_id = $6 AND version = $7
    RETURNING *
  `;
  return pool.query(query, [
    correctness,
    responsiveness,
    ramp_up,
    bus_factor,
    license_metric,
    packageID,
    version,
  ]);
};

// Delete package versions by package ID
export const deletePackageVersionsByPackageIDQuery = (
  client: PoolClient,
  packageID: string
) => {
  return client.query('DELETE FROM pack_version WHERE p_id = $1', [packageID]);
};

// Delete package by ID
export const deletePackageByIDQuery = (
  client: PoolClient,
  packageID: string
) => {
  return client.query('DELETE FROM package WHERE p_id = $1 RETURNING *', [
    packageID,
  ]);
};

// Insert new package
export const insertPackageQuery = (
  client: PoolClient,
  name: string,
  github_url: string
) => {
  const query = `
    INSERT INTO package (name, github_url)
    VALUES ($1, $2)
    RETURNING *
  `;
  return client.query(query, [name, github_url]);
};

// Insert package version
export const insertPackageVersionQuery = (
  client: PoolClient,
  version: string,
  packageID: string,
  correctness: number,
  responsiveness: number,
  ramp_up: number,
  bus_factor: number,
  license_metric: number
) => {
  const query = `
    INSERT INTO pack_version (version, p_id, correctness, responsiveness, ramp_up, bus_factor, license_metric)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  return client.query(query, [
    version,
    packageID,
    correctness,
    responsiveness,
    ramp_up,
    bus_factor,
    license_metric,
  ]);
};

// ------------------------------------------------------------------------------------
// New Queries for Additional Endpoints
// ------------------------------------------------------------------------------------

// Search packages based on query
export const searchPackagesQuery = (packageQueries: any[], offset: number) => {
    // Check if the request is for enumerating all packages (name == "*")
    const isAllPackagesQuery = packageQueries.length === 1 && packageQueries[0].Name === "*";
  
    const packageNames = packageQueries.map(query => query.Name);
    const packageVersions = packageQueries.map(query => query.Version);
  
    let query;
    let queryParams;
  
    if (isAllPackagesQuery) {
      // If the query is for all packages, don't filter by name or version
      query = `
        SELECT
          p.p_id,
          p.name,
          p.github_url,
          pv.version,
          pv.correctness,
          pv.responsiveness,
          pv.ramp_up,
          pv.bus_factor,
          pv.license_metric
        FROM
          package p
        LEFT JOIN
          pack_version pv ON p.p_id = pv.p_id
        OFFSET $1
      `;
      queryParams = [offset];
    } else {
      // If it's not a "*" query, use name and version filters
      query = `
        SELECT
          p.p_id,
          p.name,
          p.github_url,
          pv.version,
          pv.correctness,
          pv.responsiveness,
          pv.ramp_up,
          pv.bus_factor,
          pv.license_metric
        FROM
          package p
        LEFT JOIN
          pack_version pv ON p.p_id = pv.p_id
        WHERE p.name = ANY($1::text[])
        AND pv.version = ANY($2::text[])
        OFFSET $3
      `;
      queryParams = [packageNames, packageVersions, offset];
    }
  
    return pool.query(query, queryParams);
  };
  
  
// Reset the registry (delete all packages and their versions)
export const resetRegistryQuery = () => {
  const query = `
    TRUNCATE package CASCADE;
    TRUNCATE pack_version CASCADE;
  `;
  return pool.query(query);
};

// Get package rating by package ID
export const getPackageRatingQuery = (packageID: string) => {
    //net score to be edited 
  const query = `
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
  `;
  return pool.query(query, [packageID]);
};

// Search packages by regular expression
export const searchPackagesByRegExQuery = (regex: string) => {
  const query = `
    SELECT
      p.p_id,
      p.name,
      p.github_url,
      pv.version,
      pv.correctness,
      pv.responsiveness,
      pv.ramp_up,
      pv.bus_factor,
      pv.license_metric
    FROM
      package p
    LEFT JOIN
      pack_version pv ON p.p_id = pv.p_id
    WHERE
      p.name ~* $1 
  `;
  return pool.query(query, [regex]);
};

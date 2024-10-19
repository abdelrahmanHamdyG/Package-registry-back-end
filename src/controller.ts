// controller.ts
import { Request, Response } from 'express';
import pool from './db.js'; // Adjust the path according to your project structure
import {
  getPackageByIDQuery,
  getPackageByNameQuery,
  updatePackageByIDQuery,
  updatePackageVersionMetricsQuery,
  deletePackageVersionsByPackageIDQuery,
  deletePackageByIDQuery,
  insertPackageQuery,
  insertPackageVersionQuery,
  searchPackagesQuery, // New
  resetRegistryQuery,  // New
  getPackageRatingQuery, // New
  searchPackagesByRegExQuery, // New
} from './queries.js';

interface Version {
  version: string;
  correctness: number;
  responsiveness: number;
  ramp_up: number;
  bus_factor: number;
  license_metric: number;
}


// Get package by ID
export const getPackageByID = (req: Request, res: Response) => {
  const packageID = req.params.id;

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    return;
  }

  getPackageByIDQuery(packageID)
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Package not found' });
        return;
      }

      const packageData = {
        p_id: result.rows[0].p_id,
        name: result.rows[0].name,
        github_url: result.rows[0].github_url,
        versions: result.rows.map((row) => ({
          version: row.version,
          correctness: row.correctness,
          responsiveness: row.responsiveness,
          ramp_up: row.ramp_up,
          bus_factor: row.bus_factor,
          license_metric: row.license_metric,
        })),
      };

      res.status(200).json(packageData);
    })
    .catch(error => {
      console.error('Error getting package by ID:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};

// Get package by Name
export const getPackageByName = (req: Request, res: Response) => {
  const packageName = req.params.name;

  if (!packageName) {
    res.status(400).json({ error: 'Package name is required' });
    return;
  }

  getPackageByNameQuery(packageName)
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Package not found' });
        return;
      }

      const packageData = {
        p_id: result.rows[0].p_id,
        name: result.rows[0].name,
        github_url: result.rows[0].github_url,
        versions: result.rows.map((row) => ({
          version: row.version,
          correctness: row.correctness,
          responsiveness: row.responsiveness,
          ramp_up: row.ramp_up,
          bus_factor: row.bus_factor,
          license_metric: row.license_metric,
        })),
      };

      res.status(200).json(packageData);
    })
    .catch(error => {
      console.error('Error getting package by name:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};

// Update package by ID
export const updatePackageByID = (req: Request, res: Response) => {
  const packageID = req.params.id;
  const { name, github_url } = req.body;

  if (!packageID || !name || !github_url) {
    res.status(400).json({ error: 'Package ID, name, and GitHub URL are required' });
    return;
  }

  updatePackageByIDQuery(packageID, name, github_url)
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Package not found' });
        return;
      }

      res.status(200).json(result.rows[0]);
    })
    .catch(error => {
      console.error('Error updating package by ID:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};

// Update package version metrics by ID and version
export const updatePackageVersionMetrics = (req: Request, res: Response) => {
  const packageID = req.params.iid;
  const { version } = req.params;
  const {
    correctness,
    responsiveness,
    ramp_up,
    bus_factor,
    license_metric,
  } = req.body;

  if (!packageID || !version || !correctness || !responsiveness || !ramp_up || !bus_factor || !license_metric) {
    res.status(400).json({ error: 'Package ID, version, and all metrics are required' });
    return;
  }

  updatePackageVersionMetricsQuery(
    packageID,
    version,
    correctness,
    responsiveness,
    ramp_up,
    bus_factor,
    license_metric
  )
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Package version not found' });
        return;
      }

      res.status(200).json(result.rows[0]);
    })
    .catch(error => {
      console.error('Error updating package version metrics:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};

// Delete package by ID
export const deletePackageByID = (req: Request, res: Response) => {
  const packageID = req.params.iid;

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    return;
  }

  pool.connect()
    .then(client => {
      return client.query('BEGIN')
        .then(() => deletePackageVersionsByPackageIDQuery(client, packageID))
        .then(() => deletePackageByIDQuery(client, packageID))
        .then(packageResult => {
          if (packageResult.rows.length === 0) {
            return client.query('ROLLBACK').then(() => {
              res.status(404).json({ error: 'Package not found' });
            });
          }

          return client.query('COMMIT').then(() => {
            res.status(200).json({
              message: 'Package deleted successfully',
              package: packageResult.rows[0],
            });
          });
        })
        .catch(error => {
          return client.query('ROLLBACK').then(() => {
            console.error('Error deleting package:', error);
            res.status(500).json({ error: 'Internal Server Error' });
          });
        })
        .finally(() => {
          client.release();
        });
    })
    .catch(error => {
      console.error('Database connection error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};

// Upload new package
export const uploadPackage = (req: Request, res: Response) => {
  const {
    name,
    github_url,
    version,
    correctness,
    responsiveness,
    ramp_up,
    bus_factor,
    license_metric,
  } = req.body;

  if (!name || !github_url || !version || !correctness || !responsiveness || !ramp_up || !bus_factor || !license_metric) {
    res.status(400).json({ error: 'All package data fields are required' });
    return;
  }

  pool.connect()
    .then(client => {
      return client.query('BEGIN')
        .then(() => insertPackageQuery(client, name, github_url))
        .then(packageResult => {
          const packageID = packageResult.rows[0].p_id;

          return insertPackageVersionQuery(
            client,
            version,
            packageID,
            correctness,
            responsiveness,
            ramp_up,
            bus_factor,
            license_metric
          ).then(versionResult => {
            return client.query('COMMIT').then(() => {
              res.status(201).json({
                ...packageResult.rows[0],
                versions: [versionResult.rows[0]],
              });
            });
          });
        })
        .catch(error => {
          return client.query('ROLLBACK').then(() => {
            console.error('Error uploading new package:', error);
            res.status(500).json({ error: 'Internal Server Error' });
          });
        })
        .finally(() => {
          client.release();
        });
    })
    .catch(error => {
      console.error('Database connection error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};


// POST /packages
export const searchPackages = (req: Request, res: Response) => {
  const packageQueries = req.body;
  const offsetParam = req.query.offset;
  const offset = offsetParam ? parseInt(offsetParam as string, 10) : 0;

  if (!Array.isArray(packageQueries) || packageQueries.length === 0) {
    res.status(400).json({ error: 'Invalid PackageQuery format' });
    return;
  }

  searchPackagesQuery(packageQueries, offset)
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'No packages found' });
        return;
      }

      res.status(200).json(result.rows);
    })
    .catch(error => {
      console.error('Error searching packages:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};

// DELETE /reset
export const resetRegistry = (req: Request, res: Response) => {
  resetRegistryQuery()
    .then(() => {
      res.status(200).json({ message: 'Registry has been reset.' });
    })
    .catch(error => {
      console.error('Error resetting registry:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};

// GET /package/{id}/rate
export const getPackageRating = (req: Request, res: Response) => {
  const packageID = req.params.id;

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    return;
  }

  getPackageRatingQuery(packageID)
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Package not found' });
        return;
      }

      const rating = result.rows[0];

      // Check if any metric failed (e.g., value is null or -1)
      const metrics = [
        'bus_factor',
        'correctness',
        'ramp_up',
        'responsive_maintainer',
        'license_score',
        'good_pinning_practice',
        'pull_request',
        'net_score',
      ];
      const metricFailed = metrics.some(
        (metric) => rating[metric] === null || rating[metric] === -1
      );

      if (metricFailed) {
        res.status(400).json({ error: 'Rating calculation failed due to invalid metrics.' });
        return;
      }

      res.status(200).json(rating);
    })
    .catch(error => {
      console.error('Error getting package rating:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};



function isValidRegex(pattern: string) {
  // RegExp that checks for valid regex characters or symbols
  const regexValidationPattern = /^(?![\s\S]*[\[\]\(\)\{\}][^\[\]\(\)\{\}]*$)[\s\S]*$/;
  return regexValidationPattern.test(pattern);
}

// POST /package/byRegEx
export const searchPackagesByRegEx = (req: Request, res: Response) => {
  const { RegEx } = req.body;

  if (!RegEx || !isValidRegex(RegEx)) {
    res.status(400).json({ error: 'No or Invalid RegEx.' });
    return;
  }

  searchPackagesByRegExQuery(RegEx)
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'No package found under this regex.' });
        return;
      }

      res.status(200).json(result.rows);
    })
    .catch(error => {
      console.error('Error searching packages by RegEx:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
};


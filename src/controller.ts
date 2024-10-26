// controller.ts
import { Request, Response } from 'express';
import http from "isomorphic-git/http/node/index.js";
import * as git from 'isomorphic-git'
import fs from 'fs'
import archiver from "archiver"; // Import archiver for zipping
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

import { Logger } from './logger.js';
import { UploadFileToS3, getFile, uploadDirectoryToS3 } from './s3.js';

// Initialize the logger
const logger = new Logger();

// Get package by name
export const getPackageByName = async (req: Request, res: Response) => {
  const packageName = req.params.name;

  logger.log('Received request to get package by name');

  if (!packageName) {
    res.status(400).json({ error: 'Package name is required' });
    logger.logError('Package name is required');
    return;
  }

  try {
    const result = await getPackageByNameQuery(packageName);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Package not found' });
      logger.logError(`Package not found: ${packageName}`);
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
    logger.log(`Successfully retrieved package: ${packageName}`);
  } catch (error) {
    console.error('Error getting package by name:', error);
    logger.logError(`Error getting package by name: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Get package by ID
export const getPackageByID = async (req: Request, res: Response) => {
  const packageID = req.params.id;

  logger.log('Received request to get package by ID');

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    logger.logError('Package ID is required');
    return;
  }

  try {
    const result = await getPackageByIDQuery(packageID);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Package not found' });
      logger.logError(`Package not found: ID ${packageID}`);
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
    logger.log(`Successfully retrieved package with ID: ${packageID}`);
  } catch (error) {
    console.error('Error getting package by ID:', error);
    logger.logError(`Error getting package by ID: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Update package by ID
export const updatePackageByID = async (req: Request, res: Response) => {
  const packageID = req.params.id;
  const { name, github_url } = req.body;

  logger.log('Received request to update package by ID');

  if (!packageID || !name || !github_url) {
    res.status(400).json({ error: 'Package ID, name, and GitHub URL are required' });
    logger.logError('Package ID, name, and GitHub URL are required');
    return;
  }

  try {
    const result = await updatePackageByIDQuery(packageID, github_url);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Package not found' });
      logger.logError(`Package not found for update: ID ${packageID}`);
      return;
    }

    res.status(200).json(result.rows[0]);
    logger.log(`Successfully updated package with ID: ${packageID}`);
  } catch (error) {
    console.error('Error updating package by ID:', error);
    logger.logError(`Error updating package by ID: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Delete package by ID
export const deletePackageByID = async (req: Request, res: Response) => {
  const packageID = req.params.id;

  logger.log('Received request to delete package by ID');

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    logger.logError('Package ID is required');
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    logger.log('Transaction started for deleting package');

    await deletePackageVersionsByPackageIDQuery(client, packageID);
    logger.log(`Deleted package versions for package ID: ${packageID}`);

    const packageResult = await deletePackageByIDQuery(client, packageID);

    if (packageResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Package not found' });
      logger.logError(`Package not found for deletion: ID ${packageID}`);
      return;
    }

    await client.query('COMMIT');
    logger.log('Transaction committed for deleting package');

    res.status(200).json({
      message: 'Package deleted successfully',
      package: packageResult.rows[0],
    });
    logger.log(`Successfully deleted package with ID: ${packageID}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error deleting the package: ${error}`);
    logger.logError(`Error deleting the package: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
};

// const zipDirectory = async (source: string, out: string) => {
//   logger.log("we started zipping");

//   // Check if the source directory exists and list its contents
//   if (!fs.existsSync(source)) {
//     logger.log(`Source directory ${source} does not exist`);
//     return;
//   }

//   const files = fs.readdirSync(source);
//   if (files.length === 0) {
//     logger.log(`Source directory ${source} is empty`);
//     return;
//   }

//   logger.log(`Contents of ${source}: ${files.join(', ')}`);

//   const archive = archiver('zip', { zlib: { level: 2 } });
//   const stream = fs.createWriteStream(out);
//   logger.log("we are here");

//   return new Promise<void>((resolve, reject) => {
//     archive
//       .directory(source, false) // Add the directory to the archive
//       .on('error', (err) => {
//         logger.log(`Error during zipping: ${err}`);
//         reject(err);
//       })
//       .pipe(stream);

//     stream.on('close', () => {
//       logger.log("everything is ok, zipping finalized");
//       resolve();
//     });

//     stream.on('error', (err) => {
//       logger.log(`Error writing zip file: ${err}`);
//       reject(err);
//     });

//     archive.finalize(); // Finalize the archive
//   });
// };

// Upload new package
export const uploadPackage = async (req: Request, res: Response) => {
  const {
    name,
    github_url,
    version,
    correctness,
    responsiveness,
    bus_factor,
    ramp_up,
    license_metric,
  } = req.body;

  logger.log('Received request to upload new package');

  if (
    !name ||
    !github_url ||
    !version ||
    correctness === undefined ||
    responsiveness === undefined ||
    ramp_up === undefined ||
    bus_factor === undefined ||
    license_metric === undefined
  ) {
    res.status(400).json({ error: 'All package data fields are required' });
    logger.logError('All package data fields are required');
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    logger.log('Transaction started for uploading package');
  
    const packageResult = await insertPackageQuery(client, name, github_url);
    const packageID = packageResult.rows[0].p_id;
    logger.log(`Inserted package with ID: ${packageID}`);
  
    const versionResult = await insertPackageVersionQuery(
      client,
      version,
      packageID,
      correctness,
      responsiveness,
      ramp_up,
      bus_factor,
      license_metric
    );
    logger.log(`Inserted package version: ${version} for package ID: ${packageID}`);
  
    await fs.promises.mkdir('./toBeUploaded', { recursive: true });
    logger.log("Directory created successfully");
  
    // Attempt git clone with specific error handling
    try {
      await git.clone({
        fs,
        http,
        dir: './toBeUploaded',
        url: github_url,
        singleBranch: true,
        depth: 1
      });
      logger.log("Repository cloned successfully");
    } catch (cloneError) {
      if (cloneError instanceof Error) {
        logger.logError(`Git clone failed: ${cloneError.message}`);
        logger.logError(`Git clone stack trace: ${cloneError.stack}`);
      } else {
        logger.logError("Git clone failed with an unknown error");
      }
      throw new Error("Git clone operation aborted");
    }
    
    // Attempt zipping with specific error handling
    // try {
    //   await zipDirectory("./toBeUploaded/", `./toBeUploaded/${packageID}-${version}.zip`);
    //   logger.log("File zipped successfully");
    // } catch (zipError) {
    //   if(zipError  instanceof Error)
    //     logger.logError(`Zipping failed: ${zipError.message}`);
    //   throw new Error("Zipping operation aborted");
    // }
  
    // Attempt S3 upload with specific error handling
    try {
      await uploadDirectoryToS3(
        `./toBeUploaded`,
        `./toBeUploaded/${packageID}-${version}`
      );
      logger.log("File uploaded to S3 successfully");
      
    } catch (s3Error) {
      if(s3Error instanceof Error)
        logger.logError(`S3 upload failed: ${s3Error.message}`);
      throw new Error("S3 upload operation aborted");
    }

    
    fs.rmSync('./toBeUploaded', { recursive: true, force: true });

    await client.query('COMMIT');
    logger.log('Transaction committed for uploading package');
  
    res.status(201).json({
      ...packageResult.rows[0],
      versions: [versionResult.rows[0]],
    });
    logger.log(`Successfully uploaded package with ID: ${packageID}`);
  } catch (error) {
    await client.query('ROLLBACK');
    
    if(error instanceof Error)
      logger.log(`Error uploading new package: ${error.message}\n${error.stack}`);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
  
};

// Get package rating
export const getPackageRating = async (req: Request, res: Response) => {
  const packageID = req.params.id;

  logger.log('Received request to get package rating');

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    logger.logError('Package ID is required');
    return;
  }

  try {
    const all_metrics = await getPackageRatingQuery(packageID);


    if (!all_metrics.rows.length) {
      res.status(404).json({ error: 'Package not found' });
      logger.logError(`No package found with ID: ${packageID}`);
      return;
    }

    const some_version_metrics = all_metrics.rows[0];
    res.status(200).json(some_version_metrics);
    logger.log(`Successfully retrieved rating for package ID: ${packageID}`);
  } catch (error) {
    console.error('Error getting package rating:', error);
    logger.logError(`Error getting package rating: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// function isValidRegex(pattern: string) {
  
//   const regexValidationPattern = /^(?![\s\S]*[\[\]\(\)\{\}][^\[\]\(\)\{\}]*$)[\s\S]*$/;
//   return regexValidationPattern.test(pattern);
// }

// POST /package/byRegEx
// export const searchPackagesByRegEx = (req: Request, res: Response) => {
//   const { RegEx } = req.body;

//   if (!RegEx || !isValidRegex(RegEx)) {
//     res.status(400).json({ error: 'No or Invalid RegEx.' });
//     return;
//   }

//   searchPackagesByRegExQuery(RegEx)
//     .then(result => {
//       if (result.rows.length === 0) {
//         res.status(404).json({ error: 'No package found under this regex.' });
//         return;
//       }

//       res.status(200).json(result.rows);
//     })
//     .catch(error => {
//       console.error('Error searching packages by RegEx:', error);
//       res.status(500).json({ error: 'Internal Server Error' });
//     });
// };



// export const searchPackages = (req: Request, res: Response) => {
  //   const packageQueries = req.body;
  //   const offsetParam = req.query.offset;
  //   const offset = offsetParam ? parseInt(offsetParam as string, 10) : 0;
  
  //   if (!Array.isArray(packageQueries) || packageQueries.length === 0) {
  //     res.status(400).json({ error: 'Invalid PackageQuery format' });
  //     return;
  //   }
  
  //   searchPackagesQuery(packageQueries, offset)
  //     .then(result => {
  //       if (result.rows.length === 0) {
  //         res.status(404).json({ error: 'No packages found' });
  //         return;
  //       }
  
  //       res.status(200).json(result.rows);
  //     })
  //     .catch(error => {
  //       console.error('Error searching packages:', error);
  //       res.status(500).json({ error: 'Internal Server Error' });
  //     });
  // };
  
  
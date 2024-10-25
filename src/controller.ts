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

import {UploadFileToS3,getFile} from "./s3.js"

















export const getPackageByName = async (req: Request, res: Response) => {

  const packageName = req.params.name;

  console.log("we are getting package by name");
  
  if (!packageName) {
    res.status(400).json({ error: 'Package name is required' });
    return;
  }

  try{
    const result=await getPackageByNameQuery(packageName)
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

  }catch(error){
    console.error('Error getting package by name:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};



// Get package by ID (Done )
export const getPackageByID = async (req: Request, res: Response) => {
  const packageID = req.params.id;

  console.log("we are getting package by ID");
  
  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    return;
  }

  try{
    const result=await getPackageByIDQuery(packageID)
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

  }catch(error){
    console.error('Error getting package by name:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};



// Update package by ID
export const updatePackageByID = async (req: Request, res: Response) => {
  const packageID = req.params.id;
  const { name, github_url } = req.body;

  if (!packageID || !name || !github_url) {
    res.status(400).json({ error: 'Package ID, name, and GitHub URL are required' });
    return;
  }

  try{
    const result=await updatePackageByIDQuery(packageID, github_url)
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Package not found' });
      return;
    }

    res.status(200).json(result.rows[0]);

  }catch(error){
    console.error('Error updating package by ID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }

};






export const deletePackageByID = async (req: Request, res: Response) => {
  const packageID = req.params.id;

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    return;
  }
  
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");
  
    await deletePackageVersionsByPackageIDQuery(client, packageID);
    const packageResult = await deletePackageByIDQuery(client, packageID);
  
    if (packageResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: 'Package not found' });
      return;
    }
  
    await client.query("COMMIT");
  
    res.status(200).json({
      message: 'Package deleted successfully',
      package: packageResult.rows[0],
    });
  
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`Error deleting the package: ${error}`);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
  
};

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

  // Check for required fields
  if (!name || !github_url || !version || !correctness || !responsiveness || !ramp_up || !bus_factor || !license_metric) {
    res.status(400).json({ error: 'All package data fields are required' });
    return;
  }

  const client = await pool.connect();

  try {
    
    await client.query('BEGIN');

    
    const packageResult = await insertPackageQuery(client, name, github_url);
    const packageID = packageResult.rows[0].p_id;

    
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

    
    await UploadFileToS3(packageID + `${version}`, `how are you my friends I am applying with name ${name}`);

    await client.query('COMMIT');
    
    res.status(201).json({
      ...packageResult.rows[0],
      versions: [versionResult.rows[0]],
    });

  } catch (error) {
    
    await client.query('ROLLBACK');
    console.error('Error uploading new package:', error);
    res.status(500).json({ error: 'Internal Server Error' });

  } finally {
    
    client.release();
  }
};



// // DELETE /reset
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
export const getPackageRating = async (req: Request, res: Response) => {
  const packageID = req.params.id;

  if (!packageID) {
    res.status(400).json({ error: 'Package ID is required' });
    return;
  }

  try{

    const all_metrics= await getPackageRatingQuery(packageID)

    if(!all_metrics.rows.length){
      console.log("no package found with this id \n")
      res.status(404).json({error:"no package found"})
    }
    const some_version_metrics=all_metrics.rows[0]
    res.status(200).json(some_version_metrics);

  }catch(error){
      console.error('Error getting package rating:', error);
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
  
  
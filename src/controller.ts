// controller.ts
import { Request, Response } from 'express';
import http from "isomorphic-git/http/node/index.js";
import * as git from 'isomorphic-git'
import fs from 'fs'
import os, { tmpdir, version } from "os"
import path from "path"
import archiver from "archiver"; // Import archiver for zipping
import pool from './db.js'; // Adjust the path according to your project structure
import {
  getPackageByIDQuery,
  insertPackageQuery,
  resetRegistryQuery,  // New 
  searchPackagesByRegExQuery,
  insertIntoPackageData,
  insertPackageRating,
  getlatestVersionByID,
  getNameVersionById, // New
} from './queries.js';

import { Logger } from './logger.js';
import { downloadFromS3, getFile, uploadBase64ToS3, uploadDirectoryToS3, uploadZipToS3 } from './s3.js';
import { JsxEmit } from 'typescript';

// Initialize the logger
const logger = new Logger();

const zipDirectory = async (source: string, out: string) => {
  const archive = archiver('zip', { zlib: { level: 2 } });
  const stream = fs.createWriteStream(out);

  return new Promise<void>((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
};

export const resetRegistry = async (req: Request, res: Response) => {
  const isAdmin:Boolean=true;
  if (!isAdmin) {
    res.status(401).json({ error: "You do not have permission to reset the registry."});
    console.error("not an admin");
    return;
  }
  const client = await pool.connect();
  try {
    await resetRegistryQuery(client);
    res.status(200).json({message:'Registry is reset'});
  }
  catch (error) {
    console.error('Error in reseting the registry:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();      
  }
};

export const searchPackagesByQueries = async (req: Request, res: Response): Promise<void> => {
  const queries: Array<{ Name: string; Version: string }> = req.body;
  const offset: number = parseInt(req.query.offset as string) || 0;
  let packages: any[] = [];

  let queryText = 'SELECT * FROM package WHERE';
  const queryParams: (string | number)[] = [];
  const conditions: string[] = [];

  try {
    for (let i = 0; i < queries.length; i++) {
      const { Name, Version } = queries[i];

      if (Name === '*') {
        conditions.push('TRUE'); // Matches all packages
      } else {
        let condition = `(name = $${queryParams.length + 1}`;
        queryParams.push(Name);

        if (Version[0] === '~') {
          const [major, minor] = Version.substring(1).split('.').map(Number);
          condition += ` AND version >= $${queryParams.length + 1} AND version < $${queryParams.length + 2}`;
          queryParams.push(`${major}.${minor}.0`, `${major}.${minor + 1}.0`);
        } else if (Version[0] === '^') {
          const [major] = Version.substring(1).split('.').map(Number);
          condition += ` AND version >= $${queryParams.length + 1} AND version < $${queryParams.length + 2}`;
          queryParams.push(`${major}.0.0`, `${major + 1}.0.0`);
        } else if (Version.includes('-')) {
          const [startVersion, endVersion] = Version.split('-').map(v => v.trim());
          condition += ` AND version >= $${queryParams.length + 1} AND version <= $${queryParams.length + 2}`;
          queryParams.push(startVersion, endVersion);
        } else {
          condition += ` AND version = $${queryParams.length + 1}`;
          queryParams.push(Version);
        }

        condition += ')';
        conditions.push(condition);
      }
    }

    // Combine conditions with OR
    queryText += ` ${conditions.join(' OR ')}`;

    // Add pagination with OFFSET and LIMIT for each page (let's set limit to 10 as an example)
    const limit = 10;
    queryText += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    console.log(`The query is: ${queryText}`);
    console.log(`Query parameters: ${queryParams}`);

    // Execute the combined query
    const result = await pool.query(queryText, queryParams);
    packages = result.rows;

    // Return response with packages and offset in headers
    res.setHeader('offset', offset + limit); // Set the offset for the next page in response header
    res.status(200).json({ packages });
  } catch (error) {
    console.error('Error executing query', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
export const uploadPackage = async (req: Request, res: Response) => {
  const { Name, Content, JSProgram, debloat, URL } = req.body;

  if ((!Content && !URL) || (Content && URL)) {
    res.status(400).json({ error: "There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)" });
    console.error("Error: Invalid format of Content and URL");
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const packageMetaData = await insertPackageQuery(client, Name, "1.0.0");
    const id:number = packageMetaData.rows[0].id;
    const key = `packages/${id}.zip`; // Example key path
    console.log(`id is ${id}`);
    if (Content) {
      
      

      
      await uploadBase64ToS3(Content,  key);

      
      await insertIntoPackageData(client, id, '', URL, debloat, JSProgram);
      await insertPackageRating(client,id);
      
      res.status(201).json({
        
        metadata:{
          Name:Name,
          Version:"1.0.0",
          ID:id
        },
        data:{
          Content:Content,
          JSProgram:JSProgram
        }
      });
      console.log(`Package ${Name} version 1.0.0 uploaded successfully`);
      
      await client.query('COMMIT');
    } else {
      // Handle cases where URL is used for ingestion instead of Content

      console.log("we are cloning ")
      const tempDir = path.join(os.tmpdir(), `repo-${id}`);
      fs.mkdirSync(tempDir, { recursive: true });

     await  git.clone({
          fs,
          http,
          dir:tempDir,
          url: URL,
          singleBranch: true,
          depth: 1,

      })
      console.log("we cloned successfully")
      const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
      await zipDirectory(tempDir, zipPath);
      console.log(`Zipped repository to ${zipPath}`);
      const fileStream = fs.createReadStream(zipPath);
      uploadZipToS3(key,fileStream,'application/zip')


      const zipFileContent = fs.readFileSync(zipPath);
      const base64Content = zipFileContent.toString('base64');

      await insertIntoPackageData(client, id, '', URL, debloat, JSProgram);
      await insertPackageRating(client, id);


      res.status(201).json({
        
        metadata:{
          Name:Name,
          Version:"1.0.0",
          ID:id
        },
        data:{
          Content:base64Content,
          JSProgram:JSProgram
        }
      });

      await client.query('COMMIT');
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      if (fs.existsSync(zipPath)) {
        fs.rmSync(zipPath);
      }

    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in uploading package:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
    
  }
};

export const getPackageByID = async (req: Request, res: Response)=> {

  const id = req.params.id as unknown as number;
  console.log(`id from get Package by id is ${id}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const package_data = await getPackageByIDQuery(client, id);

    if (package_data.rows.length === 0) {
      console.error("Package doesn't exist");
      await client.query("ROLLBACK");
       res.status(404).json({ error: "Package doesn't exist" });
       return;
    }

    const current_data = package_data.rows[0];

    // Read from S3
    const key = `packages/${id}.zip`;
    const zipFileContent = await downloadFromS3(key);
    console.log(`Downloaded package from S3 for id: ${id}`);

    await client.query("COMMIT");

    res.status(200).json({
      metadata: {
        Name: current_data.name,
        Version: current_data.version,
        ID: current_data.id,
      },
      data: {
        Content: zipFileContent.toString('base64'),
        JSProgram: current_data.js_program,
        debloat: current_data.debloat,
        URL: current_data.url,
      },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Error in getting package by ID:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
};

export const searchPackageByRegex = async (req: Request, res: Response) => {
  const { RegEx } = req.body;

  if (!RegEx) {
    res.status(400).json({ error: "There is missing field(s) in the PackageRegEx or it is formed improperly, or is invalid"});
    console.error("Error: There is no Regex");
    return;
  }
  const client = await pool.connect();
  try {


    const packageMetaData = await searchPackagesByRegExQuery(client,RegEx);

    if(packageMetaData.rows.length===0){
      res.status(404).json({error: "No package found under this regex"});
      console.error("Error: There is no package for that Regex");
      return; 
    }

    const metadataList=[]
    for (let i=0;i<packageMetaData.rows.length;i++){
    
    const packId:number = packageMetaData.rows[i].id;
    const packName:string=packageMetaData.rows[i].name;
    const packVersion:string=packageMetaData.rows[i].version;
    
      metadataList.push({
        metadata:{
          Name:packName,
          Version:packVersion,
          ID:packId
        }
      });
    }
    res.status(200).json(metadataList)
    
  }
  catch (error) {
    console.error('Error in searching by Regex:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();      
  }
};


export const updatePackage = async (req: Request, res: Response) => {
  const packageId:number = req.params.id as unknown as number;  // Extracting the path parameter

  // Extracting from req.body
  const { metadata, data } = req.body;
  const { Name, Version } = metadata || {}; 
  const { Content, URL, debloat,JSProgram } = data || {};
  const client = await pool.connect();
  console.log(`package id is ${packageId}`)
  const returnedName=(await (getNameVersionById(client,packageId))).rows[0].name
  const latestVersion=(await(getlatestVersionByID(client,packageId))).rows[0]
  console.log(`latest verion is ${latestVersion}`)
  console.log(`latestVersion MaxVersion is ${latestVersion.maxversion}`)
  const v1Parts = Version.split('.').map(Number);
  const v2Parts = (latestVersion.maxversion).split('.').map(Number);
  let result=0;
  for (let i = 0; i < 3; i++) {
      if (v1Parts[i] > v2Parts[i]) result = 1;   // updated Version is the latest
      if (v1Parts[i] < v2Parts[i]) result = -1;  // the updated version is not the latest
  }
  if ((!Content && !URL) || (Content && URL)|| !Name ||!Version  ||(returnedName!=Name) ) {
    console.log(`Name is ${Name} returned name is ${returnedName}`)
    res.status(400).json({ error: "There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)" });
    console.error("Error: Invalid format of Content and URL");
    return;
  }
  if(result==-1){
    res.status(200).json({message:'the updated is outdated so no thing to do'});
  }
  else{
    try {
      await client.query('BEGIN');
      const packageMetaData = await insertPackageQuery(client, Name, Version);
      const id= packageMetaData.rows[0].id;
      const key = `packages/${id}.zip`; // Example key path
      console.log(`id is ${id}`);
      if (Content) {
        
        

        
        await uploadBase64ToS3(Content,  key);

        
        await insertIntoPackageData(client, id, Content, URL, debloat, JSProgram);
        await insertPackageRating(client,id);
        
        res.status(201).json({
          
          metadata:{
            Name:Name,
            Version:Version,
            ID:id
          },
          data:{
            Content:Content,
            JSProgram:JSProgram
          }
        });
        console.log(`Package ${Name} version${Version} uploaded successfully`);
        
        await client.query('COMMIT');
      } else {
        // Handle cases where URL is used for ingestion instead of Content

        console.log("we are cloning ")
        const tempDir = path.join(os.tmpdir(), `repo-${id}`);
        fs.mkdirSync(tempDir, { recursive: true });

      await  git.clone({
            fs,
            http,
            dir:tempDir,
            url: URL,
            singleBranch: true,
            depth: 1,

        })
        console.log("we cloned successfully")
        const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
        await zipDirectory(tempDir, zipPath);
        console.log(`Zipped repository to ${zipPath}`);
        const fileStream = fs.createReadStream(zipPath);
        uploadZipToS3(key,fileStream,'application/zip')


        const zipFileContent = fs.readFileSync(zipPath);
        const base64Content = zipFileContent.toString('base64');

        await insertIntoPackageData(client, id, base64Content, URL, debloat, JSProgram);
        await insertPackageRating(client, id);


        res.status(201).json({
          
          metadata:{
            Name:Name,
            Version:Version,
            ID:id
          },
          data:{
            Content:base64Content,
            JSProgram:JSProgram
          }
        });

        await client.query('COMMIT');
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        if (fs.existsSync(zipPath)) {
          fs.rmSync(zipPath);
        }

      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in uploading package:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      client.release();
      
    }
  }
};

// Get package by name
// export const getPackageByName = async (req: Request, res: Response) => {
//   const packageName = req.params.name;

//   logger.log('Received request to get package by name');

//   if (!packageName) {
//     res.status(400).json({ error: 'Package name is required' });
//     logger.logError('Package name is required');
//     return;
//   }

//   try {
//     const result = await getPackageByNameQuery(packageName);
//     if (result.rows.length === 0) {
//       res.status(404).json({ error: 'Package not found' });
//       logger.logError(`Package not found: ${packageName}`);
//       return;
//     }

//     const packageData = {
//       p_id: result.rows[0].p_id,
//       name: result.rows[0].name,
//       github_url: result.rows[0].github_url,
//       versions: result.rows.map((row) => ({
//         version: row.version,
//         correctness: row.correctness,
//         responsiveness: row.responsiveness,
//         ramp_up: row.ramp_up,
//         bus_factor: row.bus_factor,
//         license_metric: row.license_metric,
//       })),
//     };
//     res.status(200).json(packageData);
//     logger.log(`Successfully retrieved package: ${packageName}`);
//   } catch (error) {
//     console.error('Error getting package by name:', error);
//     logger.logError(`Error getting package by name: ${error}`);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// // Get package by ID
// export const getPackageByID = async (req: Request, res: Response) => {
//   const packageID = req.params.id;

//   logger.log('Received request to get package by ID');

//   if (!packageID) {
//     res.status(400).json({ error: 'Package ID is required' });
//     logger.logError('Package ID is required');
//     return;
//   }

//   try {
//     const result = await getPackageByIDQuery(packageID);
//     if (result.rows.length === 0) {
//       res.status(404).json({ error: 'Package not found' });
//       logger.logError(`Package not found: ID ${packageID}`);
//       return;
//     }

//     const packageData = {
//       p_id: result.rows[0].p_id,
//       name: result.rows[0].name,
//       github_url: result.rows[0].github_url,
//       versions: result.rows.map((row) => ({
//         version: row.version,
//         correctness: row.correctness,
//         responsiveness: row.responsiveness,
//         ramp_up: row.ramp_up,
//         bus_factor: row.bus_factor,
//         license_metric: row.license_metric,
//       })),
//     };
//     res.status(200).json(packageData);
//     logger.log(`Successfully retrieved package with ID: ${packageID}`);
//   } catch (error) {
//     console.error('Error getting package by ID:', error);
//     logger.logError(`Error getting package by ID: ${error}`);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// // Update package by ID
// export const updatePackageByID = async (req: Request, res: Response) => {
//   const packageID = req.params.id;
//   const { name, github_url } = req.body;

//   logger.log('Received request to update package by ID');

//   if (!packageID || !name || !github_url) {
//     res.status(400).json({ error: 'Package ID, name, and GitHub URL are required' });
//     logger.logError('Package ID, name, and GitHub URL are required');
//     return;
//   }

//   try {
//     const result = await updatePackageByIDQuery(packageID, github_url);
//     if (result.rows.length === 0) {
//       res.status(404).json({ error: 'Package not found' });
//       logger.logError(`Package not found for update: ID ${packageID}`);
//       return;
//     }

//     res.status(200).json(result.rows[0]);
//     logger.log(`Successfully updated package with ID: ${packageID}`);
//   } catch (error) {
//     console.error('Error updating package by ID:', error);
//     logger.logError(`Error updating package by ID: ${error}`);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// // Delete package by ID
// export const deletePackageByID = async (req: Request, res: Response) => {
//   const packageID = req.params.id;

//   logger.log('Received request to delete package by ID');

//   if (!packageID) {
//     res.status(400).json({ error: 'Package ID is required' });
//     logger.logError('Package ID is required');
//     return;
//   }

//   const client = await pool.connect();

//   try {
//     await client.query('BEGIN');
//     logger.log('Transaction started for deleting package');

//     await deletePackageVersionsByPackageIDQuery(client, packageID);
//     logger.log(`Deleted package versions for package ID: ${packageID}`);

//     const packageResult = await deletePackageByIDQuery(client, packageID);

//     if (packageResult.rows.length === 0) {
//       await client.query('ROLLBACK');
//       res.status(404).json({ error: 'Package not found' });
//       logger.logError(`Package not found for deletion: ID ${packageID}`);
//       return;
//     }

//     await client.query('COMMIT');
//     logger.log('Transaction committed for deleting package');

//     res.status(200).json({
//       message: 'Package deleted successfully',
//       package: packageResult.rows[0],
//     });
//     logger.log(`Successfully deleted package with ID: ${packageID}`);
//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error(`Error deleting the package: ${error}`);
//     logger.logError(`Error deleting the package: ${error}`);
//     res.status(500).json({ error: 'Internal Server Error' });
//   } finally {
//     client.release();
//   }
// };

// // const zipDirectory = async (source: string, out: string) => {
// //   logger.log("we started zipping");

// //   // Check if the source directory exists and list its contents
// //   if (!fs.existsSync(source)) {
// //     logger.log(`Source directory ${source} does not exist`);
// //     return;
// //   }

// //   const files = fs.readdirSync(source);
// //   if (files.length === 0) {
// //     logger.log(`Source directory ${source} is empty`);
// //     return;
// //   }

// //   logger.log(`Contents of ${source}: ${files.join(', ')}`);

// //   const archive = archiver('zip', { zlib: { level: 2 } });
// //   const stream = fs.createWriteStream(out);
// //   logger.log("we are here");

// //   return new Promise<void>((resolve, reject) => {
// //     archive
// //       .directory(source, false) // Add the directory to the archive
// //       .on('error', (err) => {
// //         logger.log(`Error during zipping: ${err}`);
// //         reject(err);
// //       })
// //       .pipe(stream);

// //     stream.on('close', () => {
// //       logger.log("everything is ok, zipping finalized");
// //       resolve();
// //     });

// //     stream.on('error', (err) => {
// //       logger.log(`Error writing zip file: ${err}`);
// //       reject(err);
// //     });

// //     archive.finalize(); // Finalize the archive
// //   });
// // };

// // Upload new package
// export const uploadPackage = async (req: Request, res: Response) => {
//   const {
//     name,
//     github_url,
//     version,
//     correctness,
//     responsiveness,
//     bus_factor,
//     ramp_up,
//     license_metric,
//   } = req.body;

//   logger.log('Received request to upload new package');

//   if (
//     !name ||
//     !github_url ||
//     !version ||
//     correctness === undefined ||
//     responsiveness === undefined ||
//     ramp_up === undefined ||
//     bus_factor === undefined ||
//     license_metric === undefined
//   ) {
//     res.status(400).json({ error: 'All package data fields are required' });
//     logger.logError('All package data fields are required');
//     return;
//   }

//   const client = await pool.connect();

//   try {
//     await client.query('BEGIN');
//     logger.log('Transaction started for uploading package');
  
//     const packageResult = await insertPackageQuery(client, name, github_url);
//     const packageID = packageResult.rows[0].p_id;
//     logger.log(`Inserted package with ID: ${packageID}`);
  
//     const versionResult = await insertPackageVersionQuery(
//       client,
//       version,
//       packageID,
//       correctness,
//       responsiveness,
//       ramp_up,
//       bus_factor,
//       license_metric
//     );
//     logger.log(`Inserted package version: ${version} for package ID: ${packageID}`);
  
//     await fs.promises.mkdir('./toBeUploaded', { recursive: true });
//     logger.log("Directory created successfully");
  
//     // Attempt git clone with specific error handling
//     try {
//       await git.clone({
//         fs,
//         http,
//         dir: './toBeUploaded',
//         url: github_url,
//         singleBranch: true,
//         depth: 1
//       });
//       logger.log("Repository cloned successfully");
//     } catch (cloneError) {
//       if (cloneError instanceof Error) {
//         logger.logError(`Git clone failed: ${cloneError.message}`);
//         logger.logError(`Git clone stack trace: ${cloneError.stack}`);
//       } else {
//         logger.logError("Git clone failed with an unknown error");
//       }
//       throw new Error("Git clone operation aborted");
//     }
    
//     // Attempt zipping with specific error handling
//     // try {
//     //   await zipDirectory("./toBeUploaded/", `./toBeUploaded/${packageID}-${version}.zip`);
//     //   logger.log("File zipped successfully");
//     // } catch (zipError) {
//     //   if(zipError  instanceof Error)
//     //     logger.logError(`Zipping failed: ${zipError.message}`);
//     //   throw new Error("Zipping operation aborted");
//     // }
  
//     // Attempt S3 upload with specific error handling
//     try {
//       await uploadDirectoryToS3(
//         `./toBeUploaded`,
//         `./toBeUploaded/${packageID}-${version}`
//       );
//       logger.log("File uploaded to S3 successfully");
      
//     } catch (s3Error) {
//       if(s3Error instanceof Error)
//         logger.logError(`S3 upload failed: ${s3Error.message}`);
//       throw new Error("S3 upload operation aborted");
//     }

    
//     fs.rmSync('./toBeUploaded', { recursive: true, force: true });

//     await client.query('COMMIT');
//     logger.log('Transaction committed for uploading package');
  
//     res.status(201).json({
//       ...packageResult.rows[0],
//       versions: [versionResult.rows[0]],
//     });
//     logger.log(`Successfully uploaded package with ID: ${packageID}`);
//   } catch (error) {
//     await client.query('ROLLBACK');
    
//     if(error instanceof Error)
//       logger.log(`Error uploading new package: ${error.message}\n${error.stack}`);
//     res.status(500).json({ error: 'Internal Server Error' });
//   } finally {
//     client.release();
//   }
  
// };

// // Get package rating
// export const getPackageRating = async (req: Request, res: Response) => {
//   const packageID = req.params.id;

//   logger.log('Received request to get package rating');

//   if (!packageID) {
//     res.status(400).json({ error: 'Package ID is required' });
//     logger.logError('Package ID is required');
//     return;
//   }

//   try {
//     const all_metrics = await getPackageRatingQuery(packageID);


//     if (!all_metrics.rows.length) {
//       res.status(404).json({ error: 'Package not found' });
//       logger.logError(`No package found with ID: ${packageID}`);
//       return;
//     }

//     const some_version_metrics = all_metrics.rows[0];
//     res.status(200).json(some_version_metrics);
//     logger.log(`Successfully retrieved rating for package ID: ${packageID}`);
//   } catch (error) {
//     console.error('Error getting package rating:', error);
//     logger.logError(`Error getting package rating: ${error}`);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// // function isValidRegex(pattern: string) {
  
// //   const regexValidationPattern = /^(?![\s\S]*[\[\]\(\)\{\}][^\[\]\(\)\{\}]*$)[\s\S]*$/;
// //   return regexValidationPattern.test(pattern);
// // }

// // POST /package/byRegEx
// // export const searchPackagesByRegEx = (req: Request, res: Response) => {
// //   const { RegEx } = req.body;

// //   if (!RegEx || !isValidRegex(RegEx)) {
// //     res.status(400).json({ error: 'No or Invalid RegEx.' });
// //     return;
// //   }

// //   searchPackagesByRegExQuery(RegEx)
// //     .then(result => {
// //       if (result.rows.length === 0) {
// //         res.status(404).json({ error: 'No package found under this regex.' });
// //         return;
// //       }

// //       res.status(200).json(result.rows);
// //     })
// //     .catch(error => {
// //       console.error('Error searching packages by RegEx:', error);
// //       res.status(500).json({ error: 'Internal Server Error' });
// //     });
// // };



// // export const searchPackages = (req: Request, res: Response) => {
//   //   const packageQueries = req.body;
//   //   const offsetParam = req.query.offset;
//   //   const offset = offsetParam ? parseInt(offsetParam as string, 10) : 0;
  
//   //   if (!Array.isArray(packageQueries) || packageQueries.length === 0) {
//   //     res.status(400).json({ error: 'Invalid PackageQuery format' });
//   //     return;
//   //   }
  
//   //   searchPackagesQuery(packageQueries, offset)
//   //     .then(result => {
//   //       if (result.rows.length === 0) {
//   //         res.status(404).json({ error: 'No packages found' });
//   //         return;
//   //       }
  
//   //       res.status(200).json(result.rows);
//   //     })
//   //     .catch(error => {
//   //       console.error('Error searching packages:', error);
//   //       res.status(500).json({ error: 'Internal Server Error' });
//   //     });
//   // };
  
  
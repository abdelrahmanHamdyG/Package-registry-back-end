import e, { Request, Response } from 'express';
import http from "isomorphic-git/http/node/index.js";
import * as git from 'isomorphic-git'
import { promises as fss } from 'fs';
import fs from 'fs'
import jwt from 'jsonwebtoken';
import os, { tmpdir, version } from "os"
import path, { parse } from "path"
import AdmZip from 'adm-zip' 
import pool from '../db.js'; 
import {processUrl} from '../phase_1/cli.js'
import { downloadFromS3, uploadBase64ToS3, uploadZipToS3 } from '../s3.js';

import { checkIfIamAdmin, debloat_file, findPackageJson,getNameFromPackageJson,get_npm_package_name, get_repo_url, getGitHubRepoNameFromUrl, getPackagesFromPackageJson, isValidIdFormat, printingTheCost, zipDirectory, encodeFileToBase64, isFullMatchRegex, sanitizeRegexRepetition, extractReadmeAsync, getURLFromPackageJson } from './utility_controller.js';

import { canIReadQuery, canISearchQuery, canIUploadQuery, canUserAccessPackageQuery } from '../queries/users_queries.js';
import { getUserGroupQuery } from '../queries/groups_queries.js';
import { checkPackageExistsQuery, getLatestPackageQuery, getNameVersionByIdQuery, getPackageByIDQuery, getPackageDependeciesByIDQuery, getPackageHistoryQuery ,getPackageNameByIDQuery,getPackageRatingQuery, insertIntoPackageDataQuery, insertPackageQuery, insertPackageRatingQuery, insertToPackageHistoryQuery, insertToPackageHistoryRatingQuery, resetRegistryQuery, searchPackagesByRegExQuery, searchPackagesByRegExQueryForAdminQuery } from '../queries/packages_queries.js';
import {log} from '../phase_1/logging.js'

import {get_npm_adjacency_list} from "../controllers/utility_controller.js"

export const searchPackagesByQueries = async (req: Request, res: Response): Promise<void> => {
  const queries: Array<{ Name: string; Version?: string }> = req.body;
  const offset: number = parseInt(req.query.offset as string) || 0;
  const packages: any[] = [];
  
  log('Request body for search packages queries', req.body);
  

  if (
    !Array.isArray(queries) ||
    queries.some(
      (query) =>
        !query.Name ||
        typeof query.Name !== 'string' ||
        (query.Version !== undefined && typeof query.Version !== 'string')
    )
  ) {

    res.status(400).json({
      error:
        'There is missing field(s) in the PackageQuery or it is formed improperly, or is invalid.',
    });
    log('Invalid or missing fields in PackageQuery');
    return;
  }

  const authHeader = req.headers['x-authorization'] as string;
  const token = authHeader && authHeader.split(' ')[1];
  // Check if the user can search

  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    log(`Token is missing in searchPackage by queries`);
    return;
  }

  let queryText = 'SELECT * FROM package';
  const queryParams: (string | number)[] = [];
  const conditions: string[] = [];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;

    const isAdmin = await checkIfIamAdmin(req);
    const canISearchFlag = await canISearchQuery(userId);

    if (canISearchFlag.rows.length === 0 && isAdmin !== 1) {
      res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
      log("token is missing in search packages by queries")
      return;
    }

    if (!canISearchFlag.rows[0].can_search && isAdmin !== 1) {
      res.status(405).json({ error: 'User not allowed to search' });
      log("user is not allowed to search packages by queries")
      return;
    }

    for (let i = 0; i < queries.length; i++) {
      const { Name, Version } = queries[i];

      if (Name === '*') {
        conditions.push('TRUE'); // Matches all packages
      } else {
        let condition = `(name = $${queryParams.length + 1}`;
        queryParams.push(Name);

        if (Version) {
          // Handle Version specifications
          if (Version.startsWith('~')) {
            // Tilde version range
            const [major, minor] = Version.substring(1).split('.').map(Number);
            condition += ` AND version >= $${queryParams.length + 1} AND version < $${queryParams.length + 2}`;
            queryParams.push(`${major}.${minor}.0`, `${major}.${minor + 1}.0`);
          } else if (Version.startsWith('^')) {
            // Carat version range
            const [major] = Version.substring(1).split('.').map(Number);
            condition += ` AND version >= $${queryParams.length + 1} AND version < $${queryParams.length + 2}`;
            queryParams.push(`${major}.0.0`, `${major + 1}.0.0`);
          } else if (Version.includes('-')) {
            // Bounded range
            const [startVersion, endVersion] = Version.split('-').map(v => v.trim());
            condition += ` AND version >= $${queryParams.length + 1} AND version <= $${queryParams.length + 2}`;
            queryParams.push(startVersion, endVersion);
          } else {
            // Exact version
            condition += ` AND version = $${queryParams.length + 1}`;
            queryParams.push(Version);
          }
        }

        condition += ')';
        conditions.push(condition);
      }
    }

    // Combine conditions with OR
    if (conditions.length > 0) {
      queryText += ` WHERE ${conditions.join(' OR ')}`;
    }

    if (!isAdmin) {
      const userGroupResult = await getUserGroupQuery(userId);
      let userGroupId = null;
      if (userGroupResult.rows.length !== 0) {
        userGroupId = userGroupResult.rows[0].group_id;
      }

      queryText += ` AND (group_id = $${queryParams.length + 1} OR group_id IS NULL)`;
      queryParams.push(userGroupId);
    }

    // Add pagination with OFFSET and LIMIT
    const limit = 10;
    queryText += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    log(`The query is: ${queryText}`);
    log(`Query parameters: ${queryParams}`);

    // Execute the combined query
    const result = await pool.query(queryText, queryParams);
    log("results in searchPackegs by queries are " +result.rows)
    const packages = result.rows.map(pkg => ({
      Version: pkg.version,
      Name: pkg.name,
      ID: pkg.id.toString(), // Ensure ID is a string
    }));
    
    // Return response with packages and offset in headers
    res.setHeader('offset', offset + limit); // Set the offset for the next page in response header
    res.status(200).json( packages );
  } catch (error) {
    log(`Error executing search packages by queries : ${error}`);
    res.status(500).json({ error: 'Internal server error' });
  }
};

  
  
export const resetRegistry = async (req: Request, res: Response) => {

    const isAdmin=await checkIfIamAdmin(req);

    
    if(isAdmin==-1){
      res.status(403).json({ error: "Authentication failed due to invalid or missing AuthenticationToken."});
      log("token is missing in  reset");
      return;
      
    }
    if (isAdmin==0) {
      res.status(401).json({ error: "You do not have permission to reset the registry."});
      log("you are not allowed to reset as you are not admin");
      return;
    }

    
    try {
      await resetRegistryQuery();
      res.status(200).json({error:'Registry is reset'});
      log("Registry is reset successfully")
      return 
    }
    catch (error) {
      log(`eror in reseting the registry:${error}`, );
      res.status(500).json({ error: 'Internal Server Error' });
    }
};
  
  
  
export const uploadPackage = async (req: Request, res: Response) => {

  let { Name,Content, JSProgram, debloat, URL } = req.body;
  let key = '';
  let id = 0;

  if ((!Content && !URL) || (Content && URL)) {
    res.status(400).json({ error: "There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)" });
    log("Error: Invalid format of Content and URL during uploadPackage");
    return;
  }
  const authHeader = req.headers['x-authorization'] as string;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    log(`Unauthorized: Token missing. during uploading package`)
    return
  }
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    const canIUploadFlag=await canIUploadQuery(userId)
    
    if(!canIUploadFlag.rows[0].can_upload){
      res.status(400).json({"error":"sorry you don't have access to upload  "})
      log(`sorry you don't have access to upload package `)
      return
    }


    if (Content) {

      if (Name){
        const packageMetaData = await insertPackageQuery(client, Name, "1.0.0");
        id = packageMetaData.rows[0].id;
        key = `packages/${id}.zip`; 
        log(`uploading package ${Name} is with id:${id}`)
      }
      else{
        console.error("name is undefined")
        res.status(440).json({ error: 'Name is undefined' });
        return
      }

      log(`${Name} is uploaded by Content `)
      // it is uploaded by content
      // reading the buffer writing it to the device 
      const content_as_base64=Buffer.from(Content,"base64")
      const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
      fs.writeFileSync(zipPath, content_as_base64);
      const path_after_unzipping = path.join(os.tmpdir(), `package-${id}`);
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(path_after_unzipping, true); // Unzip to tempDir

      const readmeContent=await extractReadmeAsync(path_after_unzipping)


      let obtainedurl=getURLFromPackageJson(path_after_unzipping)
      if (obtainedurl!='no url'){
        const metrics=await processUrl(obtainedurl)
        log(`content Upload: Metics Calculated for ${obtainedurl}: `)
        if ((metrics?.NetScore||0)<0.42){
          log(`content Upload:Package ${Name} is disqualified with Net score equal ${metrics?.NetScore}
          , rampUp ${metrics?.RampUp}, busfactor${metrics?.BusFactor}, licenece${metrics?.License}, dependency${metrics?.Dependency},
           code review${metrics?.CodeReview}, correctness${metrics?.Correctness},responsiveness${metrics?.ResponsiveMaintainer}`)
           res.status(424).json({"error":"disqualified package"})
          return 
        }
        log(`content upload:Package ${Name} is qualified`)
        await insertPackageRatingQuery(client, id,metrics?.Correctness,metrics?.ResponsiveMaintainer
          ,metrics?.RampUp,metrics?.BusFactor,metrics?.License
          ,metrics?.Dependency,metrics?.CodeReview,metrics?.Correctness_Latency,metrics
          ?.ResponsiveMaintainer_Latency,metrics?.RampUp_Latency,metrics?.BusFactor_Latency,metrics
          ?.License_Latency,metrics?.DependencyLatency,metrics?.CodeReviewLatency,metrics?.NetScore ,metrics?.NetScore_Latency
        );
      }
      else{
        await insertPackageRatingQuery(client, id)
      }

      if (debloat) {
        await debloat_file(path_after_unzipping); // Use your debloat/minification function
        log(`we debloated the package ${Name} successfuly`)
      }

      const debloat_package_zipped_path=path.join(os.tmpdir(), `debloated-package-${id}.zip`);
      await zipDirectory(path_after_unzipping,debloat_package_zipped_path)
      const finalZipContent = fs.readFileSync(debloat_package_zipped_path);
      const base64FinalContent = finalZipContent.toString('base64');
      await uploadBase64ToS3(base64FinalContent,  key);
      log(`we uploaded ${Name} to S3 `)
      await insertIntoPackageDataQuery(client, id, '', URL, debloat, JSProgram,readmeContent);
      log(`we inserted ${Name} to PackageData `)
      
      log(`we inserted ${Name} to Package Rating with default values as it is content`)
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
      log(`Package ${Name} version 1.0.0 uploaded successfully`);
      if (fs.existsSync(path_after_unzipping)) 
        fs.rmSync(path_after_unzipping, { recursive: true, force: true });
      if (fs.existsSync(zipPath)) 
        fs.rmSync(zipPath);

      if (fs.existsSync(debloat_package_zipped_path)) 
        fs.rmSync(debloat_package_zipped_path);
      await insertToPackageHistoryQuery(userId,"CREATE",id,client)
      await client.query('COMMIT');

    } else {
      // the package is uploaded with URL 

      const metrics=await processUrl(URL)
      log(`Metics Calculated for ${URL}: `)
      if ((metrics?.NetScore||0)<0.5){
        res.status(424).json({"error":"disqualified package"})
        log(`Package ${Name} is disqualified`)
        return 
      }
      log(`Package ${Name} is qualified`)
      
      const tempDir = path.join(os.tmpdir(), `repo`);
      fs.mkdirSync(tempDir, { recursive: true });
      

      
      const isnpm=!URL.includes("github")
      
      if (isnpm) {
        
        log(`${URL} is an NPM package.`);
        const package_name = get_npm_package_name(URL);
        const repoURL = await get_repo_url(package_name);
        log(`The GitHub repo of the package is ${repoURL}`);

        // Clone the repository
        await git.clone({
          fs,
          http,
          dir: tempDir,
          url: repoURL,
          singleBranch: true,
          depth: 1,
        });
        log(`Cloned ${repoURL} successfully.`);

        // Get package information
        
        log("we are starting to get the name from package json")
        const packageNameFromPackageJson  = await getNameFromPackageJson(tempDir);
        if (packageNameFromPackageJson =="no name"){
          Name=package_name
        }
        else{
          Name = packageNameFromPackageJson
        }

        log("we get the name from package json successfully")


        const packageMetaData = await insertPackageQuery(client, Name, '1.0.0');
        id = packageMetaData.rows[0].id;
        key = `packages/${id}.zip`;

        URL = repoURL; // Update URL to GitHub repo URL
      } else {
        // GitHub URL provided directly
        log(`We are cloning the package ${URL}`);

        // Clone the repository
        await git.clone({
          fs,
          http,
          dir: tempDir,
          url: URL,
          singleBranch: true,
          depth: 1,
        });
        log(`Cloned ${URL} successfully.`);


        log("we are getting the name of package json")
        // Get package information
        const packageName = await getNameFromPackageJson(tempDir);
        if (packageName=="no name"){
          Name=getGitHubRepoNameFromUrl(URL) as string
        }
        else{
          Name = packageName 
        }
        const packageMetaData = await insertPackageQuery(client, Name, '1.0.0');
        id = packageMetaData.rows[0].id;
        key = `packages/${id}.zip`;
      }

      log("we got  the name of package json")
      
      
      await insertPackageRatingQuery(client, id,metrics?.Correctness,metrics?.ResponsiveMaintainer
        ,metrics?.RampUp,metrics?.BusFactor,metrics?.License
        ,metrics?.Dependency,metrics?.CodeReview,metrics?.Correctness_Latency,metrics
        ?.ResponsiveMaintainer_Latency,metrics?.RampUp_Latency,metrics?.BusFactor_Latency,metrics
        ?.License_Latency,metrics?.DependencyLatency,metrics?.CodeReviewLatency,metrics?.NetScore ,metrics?.NetScore_Latency
      );
      log(`we insert the rating of Package ${Name}`)
      const readmeContent=await extractReadmeAsync(tempDir)
      if(debloat){
        await debloat_file(tempDir)
      }
      
      const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
      await zipDirectory(tempDir, zipPath);
      log(`Zipped repository to ${zipPath}`);
      const fileStream = fs.createReadStream(zipPath);

      log(`we  starting uploaded ${URL} to S3 `)
      await uploadZipToS3(key,fileStream,'application/zip')
      log(`we uploaded ${URL} to S3 Successfully `)


      const base64Content=await encodeFileToBase64(zipPath)
      


      log("we get the zipped file succssfully")
      await insertIntoPackageDataQuery(client, id, '', URL, debloat, JSProgram,readmeContent);
      log(`we inserted ${URL} to PackageData Successfully `)



      
      log(`we statrted inserting ${Name} to history`)
      await insertToPackageHistoryQuery(userId,"CREATE",id,client)
      log(`we inserted ${Name} to history successfully`)
      await client.query('COMMIT');

      log(`we started removing the directories we used`)
      
      try {
        if (await fss.stat(tempDir).catch(() => false)) {
          await fss.rm(tempDir, { recursive: true, force: true });
        }
      
        if (await fss.stat(zipPath).catch(() => false)) {
          await fss.rm(zipPath);
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
      }      

      log(`we removed the directories we used succesfully`)

      res.status(201).json({
        // 
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

      log("res.status is called in uploading package ")
    }
  } catch (error) {
    
      
    await client.query('ROLLBACK');

    log(`Error in uploading package: ${Name} ${error}` );
    
    if (error  instanceof Error&& error.name === 'TokenExpiredError') {
      log(`Token expired:${error}` );
      res.status(401).json({ error: 'Token has expired.' });
      return;
    }
    if ((error as any).code === '23505') {
      log(`Error in uploading package:${error}`);
      res.status(409).json({ error: 'Package exists already.' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    client.release(); 
  }
};

export const getPackageByID = async (req: Request, res: Response)=> {
  log("we are getting package by id ")
  const idRead =req.params.id

  const regex = /^[a-zA-Z0-9\-]+$/;
  if(!idRead || !regex.test(idRead)){

    res.status(400).json({"error":"There is missing field(s) in the PackageID or it is formed improperly, or is invalid."})
    log("gettingPackageById: missing field");
    return
  }

  const id=Number(idRead)
  log("gettingPackageById:the number is ", id)
  if(isNaN(id)){
    res.status(404).json({"error":"Package does not exist."})
    log("gettingPackageById:package doesn't exists")
    return
  }

  

  const authHeader = req.headers['x-authorization'] as string;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    log(`GettingPacakgeByID: Unauthorized: Token missing.`)
    return
  }


  const client = await pool.connect();
  try {
    
    const isAdmin=await checkIfIamAdmin(req)

    if(isAdmin==-1){

      res.status(403).json({error:"Authentication failed due to invalid or missing AuthenticationToken."})
      log("token missing Getting Package By ID")
      return

    }
      

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    
    
    log(`my user Id is ${userId}`)
    
    await client.query("BEGIN");
    // I should check first if he has permission of download or not and then check if this package is in group or not if not I can download if in my group I can also if not in my group I can't download

    const result=await canIReadQuery(userId)    
    
    
    if(result.rows.length==0&&isAdmin!=1){

      log(`can't access user for getting package by ID `)
      res.status(500).json({"error":"Internal Server erorr"})
      return
    }
    
    const canIReadBool=result.rows[0]
    log(canIReadBool)
    if(!canIReadBool.can_download&&isAdmin!=1){

      res.status(405).json({"error":"sorry you don't have access to download this package "})
      log(`sorry you don't have access to download this package as ${userId}`)
      return
    }

    
    log(`User ${userId} can download packages `)

    const package_data = await getPackageByIDQuery(client, id);

    
    if (package_data.rows.length === 0) {
      log(`Package with id:${id} doesn't exist`);
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Package doesn't exist" });
      return;
    }

    
    
    if(package_data.rows[0].group_id ){

      log("we managed to get the package ")

      const userGroupResults=await getUserGroupQuery(userId)
      


      if(userGroupResults.rows.length==0&&isAdmin!=1){
        res.status(405).json({"error":"sorry you don't have access to download this package "})
        log(`sorry you don't have access to download this package as ${userId}`)
        return 
      }
      // log("we are here 2")
      
      if(isAdmin!=1){
        
        if(userGroupResults.rows[0].length==0&&package_data.rows[0].group_id){
          res.status(405).json({"error":"sorry you don't have access to download this package "})
          log(`sorry you don't have access to download this package as ${userId}`)
          return 
        }
        
        if(userGroupResults.rows.length>=0){

            if((package_data.rows[0].group_id)&&userGroupResults.rows[0].group_id!=package_data.rows[0].group_id ){
              res.status(405).json({"error":"sorry you don't have access to download this package "})
              log(`sorry you don't have access to download this package as ${userId}`)
              return 
            }

        }
      }

    }


    const current_data = package_data.rows[0];
    log(`we found the package with id:${id}`)

    // Read from S3
    const key = `packages/${id}.zip`;
    const zipFileContent = await downloadFromS3(key);
    log(`Downloaded package successfully from S3 for id: ${id}`);
    
    await insertToPackageHistoryQuery(userId,"DOWNLOAD",id,client)
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

    if (err  instanceof Error&& err.message === 'TokenExpiredError') {
      log(`Authentication failed due to invalid or missing AuthenticationToken.${err}`, );
      res.status(403).json({ error: 'Token has expired.' });
      return;
    }

    log(`Error in getting package by ID ${id}: ${err}`, );

    res.status(500).json({ error: 'Internal Server Error' });

  } finally {
    client.release();
  }
};


export const searchPackageByRegex = async (req: Request, res: Response) => {
  
const { RegEx } = req.body;

log(`Searching package by Regex with ${RegEx} called`)


if (!RegEx) {
  res.status(400).json({ error: "There is missing field(s) in the PackageRegEx or it is formed improperly, or is invalid"});
  log("Error: There is no Regex");
  return;
}


const client = await pool.connect();

const authHeader = req.headers['x-authorization'] as string;
const token = authHeader && authHeader.split(' ')[1];

if (!token) {
  res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
  log(`Unauthorized: Token missing. during searching Packages `)
  return
}

try {

  const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
  const userId = decoded.sub;
  const isAdmin=await checkIfIamAdmin(req)

  if(isAdmin==-1){
    
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    return;
  }


  
  if(isAdmin!=1){
    const canISearchFlag=await canISearchQuery(userId)
  
    if (!canISearchFlag.rows[0].can_search){
      
      res.status(403).json({"error":"sorry you don't have access to search with this regex "})
      log(`sorry you don't have access to search about package as ${userId}`)
      return
    }

    const userGroupResult = await getUserGroupQuery(userId);
    const userGroupId = userGroupResult.rows.length > 0 ? userGroupResult.rows[0].group_id : null;

    
    

    const packageMetaData = await searchPackagesByRegExQuery(client,RegEx,userGroupId);

    if(packageMetaData.rows.length===0){
      res.status(404).json({error: "No package found under this regex "});
      log(`Error: There is no package for that Regex ${RegEx}`);
      return; 
    }

    const metadataList=[]
    for (let i=0;i<packageMetaData.rows.length;i++){
    
      const packId:number = packageMetaData.rows[i].id;
      const packName:string=packageMetaData.rows[i].name;
      const packVersion:string=packageMetaData.rows[i].version;
      
        metadataList.push({
          
            Version:packVersion,
            Name:packName,

            ID:packId
          
        });
    }
    log("I am returning packages data got by searchPackageByRegex  successfully" + JSON.stringify(metadataList))
    res.status(200).json(metadataList)
    
  }else{

    // he is an admin
    log(`I am an admin`)
    

    
    const packageMetaData = await searchPackagesByRegExQueryForAdminQuery(client,RegEx);

    if(packageMetaData.rows.length===0){
      res.status(404).json({error: "No package found under this regex "});
      log(`Error: There is no package for that Regex ${RegEx}`);
      return; 
    }

    const metadataList=[]
    for (let i=0;i<packageMetaData.rows.length;i++){
    
      const packId:number = packageMetaData.rows[i].id;
      const packName:string=packageMetaData.rows[i].name;
      const packVersion:string=packageMetaData.rows[i].version;
      
        metadataList.push({
          
            Version:packVersion,
            Name:packName,
            ID:packId
          
        });
    }

    log("I am returning packages data got by searchPackageByRegex  successfully" + JSON.stringify(metadataList))

    res.status(200).json(metadataList)


  }


}
catch (error) {

  if (error  instanceof Error&& error.name === 'TokenExpiredError') {
    log(`Token expired:${error}` );
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    return;
  }
  log(`Error in searching by Regex: ${RegEx} ${error}` );
  res.status(400).json({error:"There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)"})
  
} finally {
  client.release();      
}
};



export const getPackageHistory=async(req:Request,res:Response)=>{


  const {id}=req.body

  log(`we are getting package history for package ${id}`)


  if(!id){
    res.status(401).json({error:"id missing "})
    log(`id ${id} missing`)
    return
  }

  const authHeader = req.headers['x-authorization']as string;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Token missing.' });
    log(`Unauthorized: Token missing.`)
    return
  }



  try{

    const isAdmin=await checkIfIamAdmin(req)

    if(isAdmin==-1){
        res.status(402).json({error:"token not found"})
        log(`token not found`)
        return
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    

    if(isAdmin==0){

      res.status(403).json({error:"Only admins are allowed to view package history"})
      log(`he is not an admin`)
      return
    }

    log(`you are an admin`)

    const doesPackageExists=await checkPackageExistsQuery(id)

    if(doesPackageExists.rows.length==0){

      res.status(404).json({error:"package doesn't exists"})
      log(`package with id ${id} doesn't exists`)
      return
    }


    const history = await getPackageHistoryQuery(id);

    if (history.rows.length === 0) {
      res.status(405).json({ error: "No history found for the specified package" });
      log(`No history found for package with ID ${id}`);
      return;
    }

    log(`Returning package history for package ${id}`);
    res.status(200).json(history.rows);
    return

  }catch(error){


    if (error  instanceof Error&& error.name === 'TokenExpiredError') {
      log(`Token expired:${error}`, );
      res.status(401).json({ error: 'Token has expired.' });
      return;
    }
    log(`error in getting package ${id} history ${error}`)
    res.status(500).json({ error: 'Internal server error' });
    return 
  }

}

export const getPackageRating=async (req:Request,res:Response)=>{ 

  const packageIdRead = req.params.id 
  const regex = /^[a-zA-Z0-9\-]+$/;

  


  
  const authHeader = req.headers['x-authorization'] as string;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    log(`ratingcheck: Unauthorized: Token missing.`)
    return
  }


  try{
    log(`rating check: package id is ${packageIdRead}`)
    if(!packageIdRead || !regex.test(packageIdRead)){
      log("rating check: we can't read the package or the id is not valid for the regex" )
      res.status(400).json({"error":"There is missing field(s) in the PackageID"})
      return
    }
    const packageId=Number(packageIdRead)
    log("rarting check: package rating is called with id ", packageId)
    
    if(isNaN(packageId)){
      log("rating: package doesn't exists")
      res.status(404).json({error:"Package does not exist."})
      return
    }
    log(`we are getting package rating for package id ${packageId}`)
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    const isAdmin=await checkIfIamAdmin(req)

    const result=await canISearchQuery(userId)    
    
    if(result.rows.length==0&&isAdmin!=1){
      res.status(403).json({"error":"Authentication failed due to invalid or missing AuthenticationToken."})
      log(`rating check:no thing returned from the table for user ${userId}`)
      return
    }

    const canISearchBool=result.rows[0].can_search
    if(!canISearchBool && isAdmin!=1){

      res.status(402).json({"error":"sorry you are not allowed to get the rating "})
      log(`rating check:sorry you  ${userId} are not allowed to get the rating `)
      return
    }


    log("rating check: we are calling can userAccessPackageQuery")
    const same_group_id=await canUserAccessPackageQuery(userId,packageId)

    if(!same_group_id && isAdmin!=1){
      res.status(402).json({"error":"sorry you are not allowed to get the rating of this package"})
      log(`rating check:sorry you are not allowed to get the rating of this package${userId}`)
      return

    }
    log("rating check: you are admin you can access the rating")

    const metrics=await getPackageRatingQuery(packageId)  

    if (metrics.rows.length==0){

      res.status(404).json({error:"Package doesn't exists"})
      log(`rating check:packageRating: package doesn't exist with id ${packageId}`)
      return
    }

    
    const packageRating = {
      BusFactor: Number(metrics.rows[0].bus_factor),
      BusFactorLatency: Number(metrics.rows[0].bus_factor_latency),
      Correctness: Number(metrics.rows[0].correctness),
      CorrectnessLatency: Number(metrics.rows[0].correctness_latency),
      RampUp: Number(metrics.rows[0].ramp_up),
      RampUpLatency: Number(metrics.rows[0].ramp_up_latency),
      ResponsiveMaintainer:Number(metrics.rows[0].responsive_maintainer),
      ResponsiveMaintainerLatency:Number(metrics.rows[0].responsive_maintainer_latency),
      LicenseScore: Number(metrics.rows[0].license_score),
      LicenseScoreLatency: Number(metrics.rows[0].license_score_latency),
      GoodPinningPractice: Number(metrics.rows[0].good_pinning_practice),
      GoodPinningPracticeLatency:Number( metrics.rows[0].good_pinning_practice_latency),
      PullRequest:Number( metrics.rows[0].pull_request),
      PullRequestLatency: Number(metrics.rows[0].pull_request_latency),
      NetScore: Number(metrics.rows[0].net_score),
      NetScoreLatency: Number(metrics.rows[0].net_score_latency)
    };
    log("rating check: package rating for package with id "+ packageId +" is: "+ JSON.stringify(packageRating))
    if(metrics.rows[0].ramp_up==-1||metrics.rows[0].correctness==-1||metrics.rows[0].bus_factor==-1||metrics.rows[0].responsive_maintainer==-1
      ||metrics.rows[0].license_score==-1||metrics.rows[0].pull_request==-1||metrics.rows[0].good_pinning_practice==-1
    ){
      log("rating check:chocked on at least one of the metrics")
      res.status(500).json({"error":"The package rating system choked on at least one of the metrics."})
      return
    }

    await insertToPackageHistoryRatingQuery(userId,"RATE",packageId)

    res.status(200).json(packageRating)

    } catch (error) {

      if (error instanceof Error&& error.message === 'TokenExpiredError') {
        log(`rating check: Token expired:${error}` );
        res.status(403).json({ error: 'Token has expired.' });
        return;
      }
      log(`rating check:Error fetching package rating:${error}`, );
      if (error instanceof Error) {
          res.status(500).json({ message: `Internal server error: ${error.message}` });
      }
      res.status(500).json({ message: 'Internal server error' });
      
  }
  return 

}



export const updatePackage = async (req: Request, res: Response) => {
  const packageId:number = req.params.id as unknown as number;  // Extracting the path parameter

  // Extracting from req.body
  const { metadata, data } = req.body;
  let {Name, Version } = metadata || {};
  let { Content, URL, debloat, JSProgram } = data || {};
  let equalNames=true
  let key = '';
  let id = 0;
  const client = await pool.connect();

  try{
    //const returnedName=(await (getNameVersionById(client,packageId))).rows[0].name
    const authHeader = req.headers['x-authorization'] as string; 
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
      log(`Update: Unauthorized: Token missing.`)
      return
    }
    
    const isAdmin=await checkIfIamAdmin(req)
    if(isAdmin==-1){
      res.status(403).json({error:"Authentication failed due to invalid or missing AuthenticationToken."})
      log("Update:can I uploadFlag return null")
      return
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    const canIUploadFlag=await canIUploadQuery(userId)
    if(canIUploadFlag.rows.length==0){
      res.status(403).json({error:"Authentication failed due to invalid or missing AuthenticationToken."})
      log("Update:can I uploadFlag return null")
      return
    }    
    if(!canIUploadFlag.rows[0].can_upload){
        res.status(405).json({error:"you are not allowed update packages"})
        log("Update:not admin and can I upload flag =0")
        return
    }
    const canAccess=await canUserAccessPackageQuery(userId,packageId)
    if(!canAccess && ! isAdmin){
      log("access problem")
      res.status(405).json({error:"you are now allowd to update this package"})
      log("Update:can update packages but this package outside his group ")
      return 
    }
    const returnedNameWithoutRows=(await (getNameVersionByIdQuery(client,packageId)))
    if(returnedNameWithoutRows.rows.length==0){
      res.status(400).json({error:"package doesn't exist" });
      log("Update:package does not exist ")
      return;
    }
    const returnedName=returnedNameWithoutRows.rows[0].name
    const latestPackage=(await(getLatestPackageQuery(client,packageId))).rows[0]
    const latestVersionBeforeSplit=latestPackage.version
    const latestPackageUrl=latestPackage.url
    if(!latestPackageUrl&&URL){
      res.status(400).json({error:"you can't change the way you upload the package with it has to be using content"});
      log("Update:changing the way of upload")
      return;
    }
    if(latestPackageUrl&&!URL){
      log("Update:changing the way of upload")
      res.status(400).json({error:"you can't change the way you upload the package with it has to be using URL"});
      return;
    }
    log(`Update:latest verion is ${latestVersionBeforeSplit}`)
    const update_version = Version.split('.').map(Number);
    const latestVersion = latestVersionBeforeSplit.split('.').map(Number);
    let result=1;
      // updated Version is the latest
    if (update_version[2] < latestVersion[2]){
        result = -1;
      }
    if ((!Content && !URL) || (Content && URL) ||!Version ) {
      log(`Update:Name is ${Name} returned name is ${returnedName}`)
      res.status(400).json({ error: "There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)" });
      console.error("Error: Invalid format of Content and URL");
      return;
    }
    if(result==-1){
      res.status(300).json({error:'the updated is outdated so no thing to do'});
      log("update: result=-1")
      return;
    }
      await client.query('BEGIN');
      if (Content) {
        if (Name!=returnedName){
          res.status(400).json({ error: "The new name and the old name aren't the same" });
          log("update:the name is different in content")
          return
        }
        const packageMetaData = await insertPackageQuery(client, Name, Version);
        id= packageMetaData.rows[0].id;
        key = `packages/${id}.zip;` // Example key path
        log(`update:id is ${id}`);
        const content_as_base64=Buffer.from(Content,"base64")
        const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
        fs.writeFileSync(zipPath, content_as_base64);
        const path_after_unzipping = path.join(os.tmpdir(), `package-${id}`);
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(path_after_unzipping, true); // Unzip to tempDir
        log("Update:Unzipped content to temporary directory.");

        const readmeContent=await extractReadmeAsync(path_after_unzipping)

        let obtainedurl=getURLFromPackageJson(path_after_unzipping)
        if (obtainedurl!='no url'){
          const metrics=await processUrl(obtainedurl)
          log(`content Upload: Metics Calculated for ${obtainedurl}: `)
          if ((metrics?.NetScore||0)<0.5){
            res.status(424).json({"error":"disqualified package"})
            log(`content Upload:Package ${Name} is disqualified`)
            return 
          }
          log(`content upload:Package ${Name} is qualified`)
          await insertPackageRatingQuery(client, id,metrics?.Correctness,metrics?.ResponsiveMaintainer
            ,metrics?.RampUp,metrics?.BusFactor,metrics?.License
            ,metrics?.Dependency,metrics?.CodeReview,metrics?.Correctness_Latency,metrics
            ?.ResponsiveMaintainer_Latency,metrics?.RampUp_Latency,metrics?.BusFactor_Latency,metrics
            ?.License_Latency,metrics?.DependencyLatency,metrics?.CodeReviewLatency,metrics?.NetScore ,metrics?.NetScore_Latency
          ); 
        }
        else {
          await insertPackageRatingQuery(client, id)
        }

        if (debloat) {
          await debloat_file(path_after_unzipping); // Use your debloat/minification function
          log("Update:Debloated package contents.");
        }
        const debloat_package_zipped_path=path.join(os.tmpdir(), `debloated-package-${id}.zip`);
        await zipDirectory(path_after_unzipping,debloat_package_zipped_path)
        const finalZipContent = fs.readFileSync(debloat_package_zipped_path);
        const base64FinalContent = finalZipContent.toString('base64');
        await uploadBase64ToS3(base64FinalContent,  key);    

        await insertIntoPackageDataQuery(client, id, '', URL, debloat, JSProgram,readmeContent);
        await insertPackageRatingQuery(client,id);  

        
        

        res.status(200).json({ 
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
        log(`Update:Package ${Name} version ${Version} uploaded successfully`);
        if (fs.existsSync(path_after_unzipping)) {
          fs.rmSync(path_after_unzipping, { recursive: true, force: true });
        }
        if (fs.existsSync(zipPath)) {
          fs.rmSync(zipPath);
        }
        if (fs.existsSync(debloat_package_zipped_path)) {
          fs.rmSync(debloat_package_zipped_path);
        }
        await client.query('COMMIT');
      } else {
        // Handle cases where URL is used for ingestion instead of Content
        // I am gonna do the rating first 
        const tempDir = path.join(os.tmpdir(),` repo-${id}`);
        fs.mkdirSync(tempDir, { recursive: true });
        const metrics=await processUrl(URL)
        if ((metrics?.NetScore||0)<0.5){
          res.status(424).json({"error":"disqualified package"})
          return 
        }
        const isnpm=!URL.includes("github")
        
        if (isnpm) {
          log(`${URL} is an NPM package.`);
          const package_name = get_npm_package_name(URL);
          const repoURL = await get_repo_url(package_name);
          log(`Update:The GitHub repo of the package is ${repoURL}`);

          // Clone the repository
          await git.clone({
            fs,
            http,
            dir: tempDir,
            url: repoURL,
            singleBranch: true,
            depth: 1,
          });
          log(`Update: Cloned ${repoURL} successfully.`);

          // Get package information
          const packageName  = getNameFromPackageJson(tempDir);
          if (packageName =="no name"){
            Name=package_name
          }
          else{
            Name = packageName
          }
          if (Name !=returnedName){
            equalNames=false
          }
          else{
            const packageMetaData = await insertPackageQuery(client, Name, Version);
            id = packageMetaData.rows[0].id;
            key = `packages/${id}.zip`;
          }
        } else {
          // GitHub URL provided directly
          log(`Update: We are cloning the package ${URL}`);

          // Clone the repository
          await git.clone({
            fs,
            http,
            dir: tempDir,
            url: URL,
            singleBranch: true,
            depth: 1,
          });
          log(`Update:Cloned ${URL} successfully.`);

          // Get package information
          const packageName =  getNameFromPackageJson(tempDir);
          if (packageName=="no name"){
            Name=getGitHubRepoNameFromUrl(URL) as string
          }
          else{
            Name = packageName 
          }
          if (Name!=returnedName){
            equalNames=false
          }
          else{
            const packageMetaData = await insertPackageQuery(client, Name, Version);
            id = packageMetaData.rows[0].id;
            key = `packages/${id}.zip`;
          }
        }
        if(equalNames){
        await insertPackageRatingQuery(client, id,metrics?.Correctness,metrics?.ResponsiveMaintainer
          ,metrics?.RampUp,metrics?.BusFactor,metrics?.License
          ,metrics?.Dependency,metrics?.CodeReview,metrics?.Correctness_Latency,metrics
          ?.ResponsiveMaintainer_Latency,metrics?.RampUp_Latency,metrics?.BusFactor_Latency,metrics
          ?.License_Latency,metrics?.DependencyLatency,metrics?.CodeReviewLatency,metrics?.NetScore ,metrics?.NetScore_Latency

        );
        const readmeContent=await extractReadmeAsync(tempDir)
        if(debloat){
          await debloat_file(tempDir)
        }
        const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
        await zipDirectory(tempDir, zipPath);
        log(`Update:Zipped repository to ${zipPath}`);
        const fileStream = fs.createReadStream(zipPath);
        uploadZipToS3(key,fileStream,'application/zip')
        const zipFileContent = fs.readFileSync(zipPath);
        const base64Content = zipFileContent.toString('base64');

        await insertIntoPackageDataQuery(client, id, '', URL, debloat, JSProgram,readmeContent);
        res.status(200).json({  
          metadata:{
            Name:Name,
            Version:Version,
            ID:id
          },
          data:{
            Content:base64Content,
            URL:URL,
            JSProgram:JSProgram,
          }
        });

        await insertToPackageHistoryQuery(userId,"UPDATE",id,client)
        await client.query('COMMIT');
        if (fs.existsSync(zipPath)) {
          fs.rmSync(zipPath);
        }
      }
      else {
        res.status(400).json({ error: "The new name and the old name aren't the same" });
        log("Update: the names are different")
      }

        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
  }catch(err){
    if (!id){
      res.status(404).json("Package does not exist.")
      log("Update: I entered the status 404")
      return
    }
    log(`Update:internal server error ${err}`)
    await client.query("ROLLBACK")
    res.status(500).json({error:"internal server error"})
    return 
  }
};



export const packageCost = async (req: Request, res: Response)=> {
  let adj_list = new Map<string, { strings: Set<string>; num: number }>();
  const id =Number(req.params.id)
  const client = await pool.connect();
  const key = `packages/${id}.zip`;
  log(`PackageCost called with id ${id}`);
  const authHeader = req.headers['x-authorization'] as string;


  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    console.error(`Unauthorized: Token missing.`)
    return
  }
  try {  
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    const isAdmin=await checkIfIamAdmin(req)
    log(`my user Id is ${userId}`)
    // I should check first if he has permission of download or not and then check if this package is in group or not if not I can download if in my group I can also if not in my group I can't download
    const result=await canISearchQuery(userId)    
    if(result.rows.length==0&&isAdmin!=1){
      res.status(500).json({"error":"The package rating system choked on at least one of the metrics."})
      console.error(`no thing returned from the table for user ${userId}`)
      return
    }
    const canIReadBool=result.rows[0]
    log(canIReadBool)
    if(!canIReadBool.can_search&&isAdmin!=1){
      res.status(400).json({"error":"sorry you don't have access to download this package "})
      console.error(`sorry you don't have access to download this package as ${userId}`)
      return
    }
    log(`User ${userId} can download packages `)

    await client.query("BEGIN");

    let package_data = await getPackageDependeciesByIDQuery(client,id);
    

    if(!package_data.rows.length){
      const zipFileContent = await downloadFromS3(key);
      let content_as_base64: Buffer;
      if (Buffer.isBuffer(zipFileContent)) {
        // If already a buffer, use it directly
        content_as_base64 = zipFileContent;
      } else if (typeof zipFileContent === 'string') {
        // If Base64 string, decode it
        content_as_base64 = Buffer.from(zipFileContent, 'base64');
      } else {
        log("da5al 2 ")
        throw new Error('Unsupported type for zipFileContent');
        
      }
      const resultsForName= await getPackageNameByIDQuery(client, id)
    
      
      if (!resultsForName.rows.length){
        log("we are returning 404 because the package doens't exist")
        res.status(404).json({ error: 'Package does not exist' });
        log("da5al 3 ")
        return
      }
      
      const Name=resultsForName.rows[0].name
      const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
      fs.writeFileSync(zipPath, content_as_base64);
      const path_after_unzipping = path.join(os.tmpdir(), `package-${id}`);
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(path_after_unzipping, true);
      const packagesList=  getPackagesFromPackageJson(path_after_unzipping)
      const stats=await fs.promises.stat(path_after_unzipping)
      adj_list.set(Name, { strings: new Set(), num: stats.size });
      const packageData = adj_list.get(Name);
      log("da5al 4 ")
      if (packageData) {
        for (const pack of packagesList) {
            packageData.strings.add(pack);
            await get_npm_adjacency_list(pack, adj_list);
        }
      }
      await printingTheCost(id, Name, adj_list, client);
      package_data = await getPackageDependeciesByIDQuery(client,id);
      if (!package_data){
        console.error(`Package with id:${id} doesn't exist`);
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Package doesn't exist" });
        return;
      }
      log("da5al 5 ")
    }


    
    if (package_data.rows.length === 0) {
      console.error(`Package with id:${id} doesn't exist`);
      await client.query("ROLLBACK");
       res.status(404).json({ error: "Package doesn't exist" });
       return;
    }
    if(package_data.rows[0].group_id ){
      const userGroupResults=await getUserGroupQuery(userId)
      if(userGroupResults.rows.length==0&&isAdmin!=1){
        res.status(600).json({"error":"sorry you don't have access to get this package cost "})
        console.error(`sorry you don't have access to get this package cost as ${userId}`)
        return 
      }
      log(`${userGroupResults.rows[0].group_id} and ${package_data.rows[0].group_id}`)
      if(userGroupResults.rows[0].group_id!=package_data.rows[0].group_id &&isAdmin!=1 ){
        res.status(600).json({"error":"sorry you don't have access to get this package cost "})
        console.error(`sorry you don't have access to get this package cost as ${userId}`)
        return 
      }

    }
    log(`we found the package with id:${id}`)
    

    await client.query("COMMIT");

    const mainPackage = package_data.rows[0];

// Parse the main package id as a number to increment from it

// Convert main package costs to numbers
const mainPackageStandalone = Number(mainPackage.standalone_cost);
const mainPackageTotal = Number(mainPackage.total_cost);

const transformedData: Record<string, any> = {
  [id]: {
    ...(mainPackageStandalone !== mainPackageTotal && { standaloneCost: mainPackageStandalone/(1024*1024) }),
    totalCost: mainPackageTotal/(1024*1024),
  },
};

// Add dependencies, incrementing from id+1 upwards
package_data.rows.slice(1).forEach((row: any, index: number) => {
  const standalone = Number(row.standalone_cost);
  const total = Number(row.total_cost);

  const dependencyKey = (id + index + 1).toString();
  transformedData[dependencyKey] = {
    ...(standalone !== total && { standaloneCost: standalone/(1024*1024) }),
    totalCost: total/(1024*1024),
  };
});

res.status(200).json(transformedData);
log(JSON.stringify(transformedData, null, 2));

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`Error in getting package dependencies by name ${id}: `, err);
    await client.query('ROLLBACK');

    
    if (err  instanceof Error&& err.name === 'TokenExpiredError') {
      log(`Token expired:${err}` );
      res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken' });
      
      return;
    }
    else if (!id){
      res.status(404).json({ error: 'Package does not exist.' });
      log("error package not exist")
    }
    else {
      res.status(500).json({ error: 'The package rating system choked on at least one of the metrics.' });
      log("error 500")
    }
  } finally {
    client.release();
  }
};
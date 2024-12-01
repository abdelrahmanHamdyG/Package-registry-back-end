import e, { Request, Response } from 'express';
import http from "isomorphic-git/http/node/index.js";
import * as git from 'isomorphic-git'
import fs from 'fs'
import jwt from 'jsonwebtoken';
import os, { tmpdir, version } from "os"
import path, { parse } from "path"
import AdmZip from 'adm-zip' 
import pool from '../db.js'; 
import {processUrl} from '../phase_1/cli.js'
import { downloadFromS3, uploadBase64ToS3, uploadZipToS3 } from '../s3.js';
import { checkIfIamAdmin, debloat_file, findPackageJson, get_npm_package_name, get_repo_url, isValidIdFormat, zipDirectory } from './utility_controller.js';
import { canIReadQuery, canISearchQuery, canIUploadQuery, canUserAccessPackageQuery } from '../queries/users_queries.js';
import { getUserGroupQuery } from '../queries/groups_queries.js';
import { checkPackageExistsQuery, getLatestPackageQuery, getNameVersionByIdQuery, getPackageByIDQuery, getPackageHistoryQuery, getPackageRatingQuery, insertIntoPackageDataQuery, insertPackageQuery, insertPackageRatingQuery, insertToPackageHistoryQuery, insertToPackageHistoryRatingQuery, resetRegistryQuery, searchPackagesByRegExQuery, searchPackagesByRegExQueryForAdminQuery } from '../queries/packages_queries.js';

export const searchPackagesByQueries = async (req: Request, res: Response): Promise<void> => {
    const queries: Array<{ Name: string; Version: string }> = req.body;
    const offset: number = parseInt(req.query.offset as string) || 0;
    let packages: any[] = [];
  

    if (
      !Array.isArray(queries) ||
      queries.some((query) =>!query.Name || typeof query.Name !== 'string' || !query.Version || typeof query.Version !== 'string')) {
      res.status(400).json({
        error: 'There is missing field(s) in the PackageQuery or it is formed improperly, or is invalid.',
      });
      console.error('Invalid or missing fields in PackageQuery');
      return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    // check first if I can search 
  
    if(!token){
        res.status(403).json({error:"Authentication failed due to invalid or missing AuthenticationToken."})
        console.log(`token is missing`)
        return
    }
    
    
    let queryText = 'SELECT * FROM package WHERE';
    const queryParams: (string | number)[] = [];
    const conditions: string[] = [];
  
    try {
  
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
      const userId = decoded.sub;
      
  
      const isAdmin=await checkIfIamAdmin(req)
      const canISearchFlag=await canISearchQuery(userId)
  
      if(canISearchFlag.rows.length==0&&isAdmin!=1){
  
        res.status(403).json("Authentication failed due to invalid or missing AuthenticationToken.")
        return
      }
  
  
      if(!canISearchFlag.rows[0].can_search){
  
        res.status(405).json("user not allowed to search")
        return
  
      }
  
  
  
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
      
      if (!isAdmin) {
        const userGroupResult = await getUserGroupQuery(userId);
        let userGroupId = 456412
        if (userGroupResult.rows.length != 0) {
          
          
          userGroupId = userGroupResult.rows[0].group_id;  
            
        }

        queryText += ` AND (group_id = $${queryParams.length + 1} OR group_id IS NULL)`;
        queryParams.push(userGroupId);
  
        
      }
  
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
  
  
  
export const resetRegistry = async (req: Request, res: Response) => {

    const isAdmin=await checkIfIamAdmin(req);

    
    if(isAdmin==-1){
      res.status(403).json({ error: "Authentication failed due to invalid or missing AuthenticationToken."});
      console.error("not an admin");
      return;
      
    }
    if (isAdmin==0) {
      res.status(401).json({ error: "You do not have permission to reset the registry."});
      console.error("not an admin");
      return;
    }

    
    try {
      await resetRegistryQuery();
      res.status(200).json({error:'Registry is reset'});
    }
    catch (error) {
      console.error('Error in reseting the registry:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
};
  
  
  

export const uploadPackage = async (req: Request, res: Response) => {
  let { Name, Content, JSProgram, debloat, URL } = req.body;
  console.log(`Uploading Package ${Name} `)

  if ((!Content && !URL) || (Content && URL)) {
    res.status(400).json({ error: "There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)" });
    console.error("Error: Invalid format of Content and URL");
    return;
  }

  
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    console.error(`Unauthorized: Token missing.`)
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
      console.error(`sorry you don't have access to upload`)
      return
  
    }

    // we are inserting to the package with group_id=NULL
    const packageMetaData = await insertPackageQuery(client, Name, "1.0.0");
    const id:number = packageMetaData.rows[0].id;
    const key = `packages/${id}.zip`; 
    console.log(`package ${Name} is with id:${id}`)


    let dependencies=new Set<string>
    if (Content) {
      
      console.log(`${Name} is uploaded by Content `)
      // it is uploaded by content

      // reading the buffer writing it to the device 
      const content_as_base64=Buffer.from(Content,"base64")
      const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
      fs.writeFileSync(zipPath, content_as_base64);

      

      const path_after_unzipping = path.join(os.tmpdir(), `package-${id}`);
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(path_after_unzipping, true); // Unzip to tempDir
      
      

      if (debloat) {
        await debloat_file(path_after_unzipping); // Use your debloat/minification function
        console.log(`we debloated the package ${Name} successfuly`)
      }


      const debloat_package_zipped_path=path.join(os.tmpdir(), `debloated-package-${id}.zip`);
      await zipDirectory(path_after_unzipping,debloat_package_zipped_path)
      

      const finalZipContent = fs.readFileSync(debloat_package_zipped_path);
      const base64FinalContent = finalZipContent.toString('base64');
      await uploadBase64ToS3(base64FinalContent,  key);


      console.log(`we uploaded ${Name} to S3 `)
      
      await insertIntoPackageDataQuery(client, id, '', URL, debloat, JSProgram);
      console.log(`we inserted ${Name} to PackageData `)

      await insertPackageRatingQuery(client,id);
      console.log(`we inserted ${Name} to Package Rating with default values as it is content`)


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
      console.log(`Metics Calculated for ${URL}: `)
      console.log(metrics)
      if ((metrics?.NetScore||0)<0.5){

        res.status(424).json({"error":"disqualified package"})
        console.log(`Package ${Name} is disqualified`)
        return 
      }
      console.log(`Package ${Name} is qualified`)
      
      await insertPackageRatingQuery(client, id,metrics?.Correctness,metrics?.ResponsiveMaintainer
        ,metrics?.RampUp,metrics?.BusFactor,metrics?.License
        ,-1,metrics?.CodeReview,metrics?.Correctness_Latency,metrics
        ?.ResponsiveMaintainer_Latency,metrics?.RampUp_Latency,metrics?.BusFactor_Latency,metrics
        ?.License_Latency,-1,metrics?.CodeReviewLatency,metrics?.NetScore ,metrics?.NetScore_Latency

      );
      console.log(`we insert the rating of Package ${Name}`)

      

       if(!URL.includes("github")){
      
         console.log(`${URL} is an NPM repo`)


         let package_name=get_npm_package_name(URL)

         console.log(`${URL} Package Name is ${package_name}`)

        
      
        
        URL=await get_repo_url(package_name)
        console.log(`the github repo of the package  is ${URL} `)


        
      }

      console.log(`we are cloning the packge ${URL}`)

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
      console.log(`we cloned ${URL} successfully`)


      // const repoSizeInBytes = getDirectorySize(tempDir);
      // const packageJsonPath = findPackageJson(tempDir);
      // if (packageJsonPath) {
      //   // console.log(`Found package.json at: ${packageJsonPath}`);

      //   // Read and parse package.json to get dependencies
      //   const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      //   // Extract dependencies and devDependencies
      //   const dependenciesSet = new Set(Object.keys(packageJson.dependencies))
      //   const devDependenciesSet = new Set(Object.keys(packageJson.devDependencies))
      //   // const totaldependencies= new Set([...devDependenciesSet, ...dependenciesSet])
      //   // await costOfGithubUrl(URL,repoSizeInBytes,totaldependencies)
      // }
      // else{
      //   console.error('error getting the dependencies');
      // }

      if(debloat){

        await debloat_file(tempDir)
      }
      
      const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
      await zipDirectory(tempDir, zipPath);
      console.log(`Zipped repository to ${zipPath}`);
      const fileStream = fs.createReadStream(zipPath);


      uploadZipToS3(key,fileStream,'application/zip')
      console.log(`we uploaded ${URL} to S3 Successfully `)


      const zipFileContent = fs.readFileSync(zipPath);
      const base64Content = zipFileContent.toString('base64');

      await insertIntoPackageDataQuery(client, id, '', URL, debloat, JSProgram);
      console.log(`we inserted ${URL} to PackageData Successfully `)


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


      await insertToPackageHistoryQuery(userId,"CREATE",id,client)
      await client.query('COMMIT');
      if (fs.existsSync(tempDir)) 
        fs.rmSync(tempDir, { recursive: true, force: true });
      
      if (fs.existsSync(zipPath)) 
        fs.rmSync(zipPath);
      

    }
  } catch (error) {
    
      
    await client.query('ROLLBACK');

    console.error(`Error in uploading package: ${Name}`, error);
    
    if (error  instanceof Error&& error.name === 'TokenExpiredError') {
      console.error('Token expired:', error);
      res.status(401).json({ error: 'Token has expired.' });
      return;
    }
  
    if ((error as any).code === '23505') {
      console.error('Error in uploading package:', error);
      res.status(409).json({ error: 'Package exists already.' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }


  } finally {
    client.release();
    
  }
};

export const getPackageByID = async (req: Request, res: Response)=> {
  console.log("here")
  const idRead =req.params.id

  const regex = /^[a-zA-Z0-9\-]+$/;
  if(!idRead || !regex.test(idRead)){

    res.status(400).json({"error":"There is missing field(s) in the PackageID or it is formed improperly, or is invalid."})
    return
  }

  const id=Number(idRead)

  if(isNaN(id)){
    res.status(404).json({"error":"Package does not exist."})
    return
  }
  console.log(`getPackageByID called with ${id}`);

  const authHeader = req.headers['authorization'];
  console.log(`auth header is ${authHeader}`)
  const token = authHeader && authHeader.split(' ')[1];
  console.log(`token  is ${authHeader}`)

  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    console.error(`Unauthorized: Token missing.`)
    return
  }


  const client = await pool.connect();
  try {
    
    const isAdmin=await checkIfIamAdmin(req)

    if(isAdmin==-1){

      res.status(403).json({error:"Authentication failed due to invalid or missing AuthenticationToken."})
      return

    }
      

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    
    
    console.log(`my user Id is ${userId}`)
    
    await client.query("BEGIN");
    // I should check first if he has permission of download or not and then check if this package is in group or not if not I can download if in my group I can also if not in my group I can't download

    const result=await canIReadQuery(userId)    
    
    
    if(result.rows.length==0&&isAdmin!=1){

      console.error(`no thing returned from the table for user ${userId}`)
      res.status(500).json({"error":"Internal Server erorr"})
      
      return
    }
    
    const canIReadBool=result.rows[0]
    console.log(canIReadBool)
    if(!canIReadBool.can_download&&isAdmin!=1){

      res.status(405).json({"error":"sorry you don't have access to download this package "})
      console.error(`sorry you don't have access to download this package as ${userId}`)
      return
    }

    
    console.log(`User ${userId} can download packages `)

    const package_data = await getPackageByIDQuery(client, id);

    console.log("we got the package by ID ")
    if (package_data.rows.length === 0) {
      console.error(`Package with id:${id} doesn't exist`);
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Package doesn't exist" });
      return;
    }

    console.log(package_data.rows[0])
    
    if(package_data.rows[0].group_id ){
      console.log("we are here1 ")
      const userGroupResults=await getUserGroupQuery(userId)
      console.log(userGroupResults)
      console.log(userGroupResults.rows[0])


      if(userGroupResults.rows.length==0&&isAdmin!=1){
        res.status(405).json({"error":"sorry you don't have access to download this package "})
        console.error(`sorry you don't have access to download this package as ${userId}`)
        return 
      }
      // console.log("we are here 2")
      
      if(isAdmin!=1){
        
        if(userGroupResults.rows[0].length==0&&package_data.rows[0].group_id){
          res.status(405).json({"error":"sorry you don't have access to download this package "})
          console.error(`sorry you don't have access to download this package as ${userId}`)
          return 
        }
        
        if(userGroupResults.rows.length>=0){

            if((package_data.rows[0].group_id)&&userGroupResults.rows[0].group_id!=package_data.rows[0].group_id ){
              res.status(405).json({"error":"sorry you don't have access to download this package "})
              console.error(`sorry you don't have access to download this package as ${userId}`)
              return 
            }

        }
      }

    }


    const current_data = package_data.rows[0];
    console.log(`we found the package with id:${id}`)

    // Read from S3
    const key = `packages/${id}.zip`;
    const zipFileContent = await downloadFromS3(key);
    console.log(`Downloaded package successfully from S3 for id: ${id}`);
    
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
      console.error('Authentication failed due to invalid or missing AuthenticationToken.', err);
      res.status(403).json({ error: 'Token has expired.' });
      return;
    }

    console.error(`Error in getting package by ID ${id}: `, err);

    res.status(500).json({ error: 'Internal Server Error' });

  } finally {
    client.release();
  }
};


export const searchPackageByRegex = async (req: Request, res: Response) => {
const { RegEx } = req.body;

console.log(`Searching package by Regext with ${RegEx} called`)


if (!RegEx) {
  res.status(400).json({ error: "There is missing field(s) in the PackageRegEx or it is formed improperly, or is invalid"});
  console.error("Error: There is no Regex");
  return;
}


const client = await pool.connect();

const authHeader = req.headers['authorization'];
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
  console.log(`isAdmin: ${isAdmin}`)
  if(isAdmin!=1){
    const canISearchFlag=await canISearchQuery(userId)
    

    if (!canISearchFlag.rows[0].can_search){
      
      res.status(405).json({"error":"sorry you don't have access to search with this regex "})
      console.error(`sorry you don't have access to search about package as ${userId}`)
      return
    }

    const userGroupResult = await getUserGroupQuery(userId);
    const userGroupId = userGroupResult.rows.length > 0 ? userGroupResult.rows[0].group_id : null;
    const packageMetaData = await searchPackagesByRegExQuery(client,RegEx,userGroupId);

    if(packageMetaData.rows.length===0){
      res.status(404).json({error: "No package found under this regex "});
      console.error(`Error: There is no package for that Regex ${RegEx}`);
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
  }else{

    // he is an admin
    console.log(`I am an admin`)
    const packageMetaData = await searchPackagesByRegExQueryForAdminQuery(client,RegEx);

    if(packageMetaData.rows.length===0){
      res.status(404).json({error: "No package found under this regex "});
      console.error(`Error: There is no package for that Regex ${RegEx}`);
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


}
catch (error) {

  if (error  instanceof Error&& error.name === 'TokenExpiredError') {
    console.error('Token expired:', error);
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    return;
  }
  console.error(`Error in searching by Regex: ${RegEx} `, error);
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
//const returnedName=(await (getNameVersionById(client,packageId))).rows[0].name
const returnedNameWithoutRows=(await (getNameVersionByIdQuery(client,packageId)))
if(returnedNameWithoutRows.rows.length==0){

  res.status(400).json({error:"package doesn't exist" });
  return;
}

const returnedName=returnedNameWithoutRows.rows[0].name


const latestPackage=(await(getLatestPackageQuery(client,packageId))).rows[0]
const latestVersionBeforeSplit=latestPackage.version
const latestPackageUrl=latestPackage.url


if(!latestPackageUrl&&URL){

  res.status(400).json({error:"you can't change the way you upload the package with it has to be using content"});
  return;
}

if(latestPackageUrl&&!URL){
  res.status(400).json({error:"you can't change the way you upload the package with it has to be using URL"});
  return;
}


console.log(`latest verion is ${latestVersionBeforeSplit}`)
console.log(`latestVersion MaxVersion is ${latestVersionBeforeSplit.maxversion}`)
const update_version = Version.split('.').map(Number);
const latestVersion = (latestVersionBeforeSplit.maxversion).split('.').map(Number);
let result=1;
   // updated Version is the latest
if (update_version[2] < latestVersion[2]){
     result = -1;
  }
if ((!Content && !URL) || (Content && URL)|| !Name ||!Version  ||(returnedName!=Name) ) {
  console.log(`Name is ${Name} returned name is ${returnedName}`)
  res.status(400).json({ error: "There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)" });
  console.error("Error: Invalid format of Content and URL");
  return;
}
if(result==-1){
  res.status(300).json({error:'the updated is outdated so no thing to do'});
  return;
}
else{
  try {
    await client.query('BEGIN');
    const packageMetaData = await insertPackageQuery(client, Name, Version);
    const id= packageMetaData.rows[0].id;
    const key = `packages/${id}.zip`; // Example key path
    console.log(`id is ${id}`);
    let dependencies:string[]=[]
    if (Content) {
      
      

      
      await uploadBase64ToS3(Content,  key);

      
      await insertIntoPackageDataQuery(client, id, Content, URL, debloat, JSProgram);
      await insertPackageRatingQuery(client,id);
      
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

      await insertIntoPackageDataQuery(client, id, base64Content, URL, debloat, JSProgram);
      await insertPackageRatingQuery(client, id);


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


export const getPackageHistory=async(req:Request,res:Response)=>{


  const {id}=req.body

  console.log(`we are getting package history for package ${id}`)


  if(!id){
    res.status(401).json({error:"id missing "})
    console.log(`id ${id} missing`)
    return
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Token missing.' });
    console.error(`Unauthorized: Token missing.`)
    return
  }



  try{

    const isAdmin=await checkIfIamAdmin(req)

    if(isAdmin==-1){
        res.status(402).json({error:"token not found"})
        console.log(`token not found`)
        return
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    

    if(isAdmin==0){

      res.status(403).json({error:"Only admins are allowed to view package history"})
      console.log(`he is not an admin`)
      return
    }

    console.log(`you are an admin`)

    const doesPackageExists=await checkPackageExistsQuery(id)

    if(doesPackageExists.rows.length==0){

      res.status(404).json({error:"package doesn't exists"})
      console.log(`package with id ${id} doesn't exists`)
      return
    }


    const history = await getPackageHistoryQuery(id);

    if (history.rows.length === 0) {
      res.status(405).json({ error: "No history found for the specified package" });
      console.log(`No history found for package with ID ${id}`);
      return;
    }

    console.log(`Returning package history for package ${id}`);
    res.status(200).json(history.rows);
    return

  }catch(error){


    if (error  instanceof Error&& error.name === 'TokenExpiredError') {
      console.error('Token expired:', error);
      res.status(401).json({ error: 'Token has expired.' });
      return;
    }
    console.log(`error in getting package ${id} history ${error}`)
    res.status(500).json({ error: 'Internal server error' });
    return 
  }



}

export const getPackageRating=async (req:Request,res:Response)=>{ 

  const packageIdRead = req.params.id 
  const regex = /^[a-zA-Z0-9\-]+$/;

  if(!packageIdRead || !regex.test(packageIdRead)){

    res.status(400).json({"error":"There is missing field(s) in the PackageID"})
    return
  }



  const packageId=Number(packageIdRead)


  if(isNaN(packageId)){
    res.status(404).json({"error":"Package does not exist."})
    return
  }


  console.log(`we are getting package rating for package id ${packageId}`)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
    console.error(`Unauthorized: Token missing.`)
    return
  }


  try{



    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    const isAdmin=await checkIfIamAdmin(req)

    const result=await canISearchQuery(userId)    
    
    if(result.rows.length==0&&isAdmin!=1){

      res.status(403).json({"error":"Authentication failed due to invalid or missing AuthenticationToken."})
      console.error(`no thing returned from the table for user ${userId}`)
      return
    }

    const canISearchBool=result.rows[0].can_search
    if(!canISearchBool && isAdmin!=1){

      res.status(402).json({"error":"sorry you are not allowed to get the rating "})
      console.error(`sorry you  ${userId} are not allowed to get the rating `)
      return
    }


    const same_group_id=await canUserAccessPackageQuery(userId,packageId)

    if(!same_group_id && isAdmin!=1){
      res.status(402).json({"error":"sorry you are not allowed to get the rating of this package"})
      console.error(`sorry you are not allowed to get the rating of this package${userId}`)
      return

    }

    const metrics=await getPackageRatingQuery(packageId)  

    if (metrics.rows.length==0){

      res.status(404).json({error:"Package doesn't exists"})
      console.error(`package doesn't exist with id ${packageId}`)
      return
    }

    
    const packageRating = {
      RampUp: metrics.rows[0].ramp_up,
      Correctness: metrics.rows[0].correctness,
      BusFactor: metrics.rows[0].bus_factor,
      ResponsiveMaintainer:metrics.rows[0].responsive_maintainer,
      LicenseScore: metrics.rows[0].license_score,
      GoodPinningPractice: metrics.rows[0].good_pinning_practice,
      PullRequest: metrics.rows[0].pull_request,
      NetScore: metrics.rows[0].net_score,
      RampUpLatency: metrics.rows[0].ramp_up_latency,
      CorrectnessLatency: metrics.rows[0].correctness_latency,
      BusFactorLatency: metrics.rows[0].bus_factor_latency,
      ResponsiveMaintainerLatency:metrics.rows[0].responsive_maintainer_latency,
      LicenseScoreLatency: metrics.rows[0].license_score_latency,
      GoodPinningPracticeLatency: metrics.rows[0].good_pinning_practice_latency,
      PullRequestLatency: metrics.rows[0].pull_request_latency,
      NetScoreLatency: metrics.rows[0].net_score_latency,
    };
  
    if(metrics.rows[0].ramp_up==-1||metrics.rows[0].correctness==-1||metrics.rows[0].bus_factor==-1||metrics.rows[0].responsive_maintainer==-1
      ||metrics.rows[0].license_score==-1||metrics.rows[0].pull_request==-1||metrics.rows[0].good_pinning_practice==-1
    ){
      console.log("chocked on at least one of the metrics")
      res.status(500).json({"error":"The package rating system choked on at least one of the metrics."})
      return
    }

    await insertToPackageHistoryRatingQuery(userId,"RATE",packageId)

    res.status(200).json(packageRating)

    } catch (error) {

      if (error instanceof Error&& error.message === 'TokenExpiredError') {
        console.error('Token expired:', error);
        res.status(403).json({ error: 'Token has expired.' });
        return;
      }
      console.error('Error fetching package rating:', error);
      if (error instanceof Error) {
          res.status(500).json({ message: `Internal server error: ${error.message}` });
      }
      res.status(500).json({ message: 'Internal server error' });
      
  }
  return 

}
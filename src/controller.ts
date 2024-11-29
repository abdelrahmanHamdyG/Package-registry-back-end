// controller.ts
import e, { Request, Response } from 'express';
import http from "isomorphic-git/http/node/index.js";
import axios from 'axios';
import * as git from 'isomorphic-git'
import fs from 'fs'
import {minify} from 'terser'
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import os, { tmpdir, version } from "os"
import path, { parse } from "path"
import AdmZip from 'adm-zip' 
import archiver from "archiver";
import pool from './db.js'; 
import {processUrl} from './phase_1/cli.js'
import { downloadFromS3, uploadBase64ToS3, uploadZipToS3 } from './s3.js';
import { Bool } from 'aws-sdk/clients/clouddirectory.js';

import {
  getPackageByIDQuery,
  insertPackageQuery,
  resetRegistryQuery,  
  searchPackagesByRegExQuery,
  insertIntoPackageData,
  insertPackageRating,
  getNameVersionById,
  getLatestPackage,
  getPackageRatingQuery,
  getAllUsersWithName,
  insertToUserToken,
  getAllGroupsWithName,
  insertToGroups,
  doesGroupExist,
  doesUserExist,
  isUserAlreadyInGroup,
  insertUserToGroup,
  canIRead,
  getUserGroup,
  canISearch,
  canIUpload,
  assign_package_group,
  checkGroupExists,
  checkPackageExists,
  getAllGroupsQuery,
  getUsersByGroupQuery,
  removeUserToken,
  updateUserGroup,
  searchPackagesByRegExQueryForAdmin,
  canUserAccessPackage,
  update_user_acces,
  get_user_acces,
  insertToPackageHistory,
  insertToPackageHistoryRating,
  getPackageHistoryQuery,
} from './queries.js';
import { Client } from 'pg';


export const searchPackagesByQueries = async (req: Request, res: Response): Promise<void> => {
  const queries: Array<{ Name: string; Version: string }> = req.body;
  const offset: number = parseInt(req.query.offset as string) || 0;
  let packages: any[] = [];


  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  // check first if I can search 

  if(!token){
      res.status(401).json({error:"Token missing"})
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
    const canISearchFlag=await canISearch(userId)

    if(canISearchFlag.rows.length==0&&isAdmin!=1){

      res.status(402).json("user not found")
      return
    }


    if(!canISearchFlag.rows[0].can_search){

      res.status(402).json("user not allowed to search")
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
      const userGroupResult = await getUserGroup(userId);

      if (userGroupResult.rows.length === 0) {
        res.status(403).json({ error: "User group not found" });
        return;
      }

      const userGroupId = userGroupResult.rows[0].group_id;

      // Append group conditions for non-admin users
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
  const isAdmin:Boolean=true;
  if (!isAdmin) {
    res.status(401).json({ error: "You do not have permission to reset the registry."});
    console.error("not an admin");
    return;
  }
  const client = await pool.connect();
  try {
    await resetRegistryQuery(client);
    res.status(200).json({error:'Registry is reset'});
  }
  catch (error) {
    console.error('Error in reseting the registry:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();      
  }
};



// import { Pool } from 'pg';
// const pool = new Pool();

export const checkIfIamAdmin = async (req: Request)=>{
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return -1; // Token is missing
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as jwt.JwtPayload;

    // Check if the token exists in the user_tokens table
    const query = `SELECT * FROM user_tokens WHERE token = $1`;
    const result = await pool.query(query, [token]);

    if (result.rows.length === 0) {
      return -1; // Token is invalid or has been logged out
    }

    // Check if the user is an admin
    if  (decoded.isAdmin)
        return 1
    else
        return 0
  } catch (err) {
    console.error("Token verification failed:", err);
    return -1; // Invalid token
  }
};




let adj_list = new Map<string, {strings: Set<string>, num: number}>();


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
      res.status(401).json({ error: 'Unauthorized: Token missing.' });
      console.error(`Unauthorized: Token missing.`)
      return
    }


    const client = await pool.connect();

    try {
      await client.query('BEGIN');


      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
      const userId = decoded.sub;
  
      const canIUploadFlag=await canIUpload(userId)
      
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
        
        await insertIntoPackageData(client, id, '', URL, debloat, JSProgram);
        console.log(`we inserted ${Name} to PackageData `)

        await insertPackageRating(client,id);
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
        

        await insertToPackageHistory(userId,"CREATE",id,client)
        await client.query('COMMIT');

      } else {
        // the package is uploaded with URL 
        
        console.log(`${Name} is uploaded by URL`)

        
        const metrics=await processUrl(URL)
        console.log(`Metics Calculated for ${URL}: `)
        console.log(metrics)
        if ((metrics?.NetScore||0)<0.5){

          res.status(424).json({"error":"disqualified package"})
          console.log(`Package ${Name} is disqualified`)
          return 
        }
        console.log(`Package ${Name} is qualified`)
        
        await insertPackageRating(client, id,metrics?.Correctness,metrics?.ResponsiveMaintainer
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

          
        //   // await get_npm_adjacency_list(package_name)
        //   for (const x of adj_list){
        //     console.log(x)
        //   }
          
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
        const packageJsonPath = findPackageJson(tempDir);
        if (packageJsonPath) {
          // console.log(`Found package.json at: ${packageJsonPath}`);

          // Read and parse package.json to get dependencies
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

          // Extract dependencies and devDependencies
          const dependenciesSet = new Set(Object.keys(packageJson.dependencies))
          const devDependenciesSet = new Set(Object.keys(packageJson.devDependencies))
          // const totaldependencies= new Set([...devDependenciesSet, ...dependenciesSet])
          // await costOfGithubUrl(URL,repoSizeInBytes,totaldependencies)
        }
        else{
          console.error('error getting the dependencies');
        }

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

        await insertIntoPackageData(client, id, '', URL, debloat, JSProgram);
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


        await insertToPackageHistory(userId,"CREATE",id,client)
        await client.query('COMMIT');
        if (fs.existsSync(tempDir)) 
          fs.rmSync(tempDir, { recursive: true, force: true });
        
        if (fs.existsSync(zipPath)) 
          fs.rmSync(zipPath);
        

      }
    } catch (error) {
      
        
      await client.query('ROLLBACK');

      console.error(`Error in uploading package: ${Name}`, error);
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

  const id =Number(req.params.id)

  console.log(`getPackageByID called with ${id}`);

  const authHeader = req.headers['authorization'];
  console.log(`auth header is ${authHeader}`)
  const token = authHeader && authHeader.split(' ')[1];
  console.log(`token  is ${authHeader}`)

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Token missing.' });
    console.error(`Unauthorized: Token missing.`)
    return
  }
  

  const client = await pool.connect();
  try {
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    
    const isAdmin=await checkIfIamAdmin(req)
    console.log(`my user Id is ${userId}`)
    
    await client.query("BEGIN");
    // I should check first if he has permission of download or not and then check if this package is in group or not if not I can download if in my group I can also if not in my group I can't download

    const result=await canIRead(userId)    
    
    
    if(result.rows.length==0&&isAdmin!=1){

      res.status(500).json({"error":"Internal Server erorr"})
      console.error(`no thing returned from the table for user ${userId}`)
      return
    }
    
    const canIReadBool=result.rows[0]
    console.log(canIReadBool)
    if(!canIReadBool.can_download&&isAdmin!=1){

      res.status(400).json({"error":"sorry you don't have access to download this package "})
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
      const userGroupResults=await getUserGroup(userId)
      console.log(userGroupResults)
      console.log(userGroupResults.rows[0])


      if(userGroupResults.rows.length==0&&isAdmin!=1){
        res.status(400).json({"error":"sorry you don't have access to download this package "})
        console.error(`sorry you don't have access to download this package as ${userId}`)
        return 
      }
      // console.log("we are here 2")
      
      if(isAdmin!=1){
        
        if(userGroupResults.rows[0].length==0&&package_data.rows[0].group_id){
          res.status(400).json({"error":"sorry you don't have access to download this package "})
          console.error(`sorry you don't have access to download this package as ${userId}`)
          return 
        }
        
        if(userGroupResults.rows.length>=0){

            if((package_data.rows[0].group_id)&&userGroupResults.rows[0].group_id!=package_data.rows[0].group_id ){
              res.status(400).json({"error":"sorry you don't have access to download this package "})
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
    
    await insertToPackageHistory(userId,"DOWNLOAD",id,client)
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
    res.status(401).json({ error: 'Unauthorized: Token missing.' });
    console.error(`Unauthorized: Token missing.`)
    return
  }

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    const isAdmin=await checkIfIamAdmin(req)
    console.log(`isAdmin: ${isAdmin}`)
    if(isAdmin!=1){
      const canISearchFlag=await canISearch(userId)
      

      if (!canISearchFlag.rows[0].can_search){
        
        res.status(400).json({"error":"sorry you don't have access to search with this regex "})
        console.error(`sorry you don't have access to search about package as ${userId}`)
        return
      }

      const userGroupResult = await getUserGroup(userId);
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
      const packageMetaData = await searchPackagesByRegExQueryForAdmin(client,RegEx);

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
  const returnedNameWithoutRows=(await (getNameVersionById(client,packageId)))
  if(returnedNameWithoutRows.rows.length==0){

    res.status(400).json({error:"package doesn't exist" });
    return;
  }

  const returnedName=returnedNameWithoutRows.rows[0].name


  const latestPackage=(await(getLatestPackage(client,packageId))).rows[0]
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


export const getPackageHistory=async(req:Request,res:Response)=>{


  const {id}=req.body

  console.log(`we are getting package history for package ${id}`)


  if(!id){
    res.status(401).json({error:"id missing "})
    console.log(`id ${id} missing`)
    return
  }


  try{

    const isAdmin=await checkIfIamAdmin(req)

    if(isAdmin==-1){
        res.status(402).json({error:"token not found"})
        console.log(`token not found`)
        return
    }

    if(isAdmin==0){

      res.status(403).json({error:"Only admins are allowed to view package history"})
      console.log(`he is not an admin`)
      return
    }

    console.log(`you are an admin`)

    const doesPackageExists=await checkPackageExists(id)

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

  }catch(err){


    console.log(`error in getting package ${id} history`)
    res.status(500).json({ error: 'Internal server error' });
    return 
  }



}

export const get_package_rating=async (req:Request,res:Response)=>{

  const packageId:number = req.params.id as unknown as number;  
  console.log(`we are getting package rating for package id ${packageId}`)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Token missing.' });
    console.error(`Unauthorized: Token missing.`)
    return
  }


  try{
    if (!packageId){
      res.status(400).json({error:"can't get package id "})
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { sub: number };
    const userId = decoded.sub;
    const isAdmin=await checkIfIamAdmin(req)

    const result=await canISearch(userId)    
    
    if(result.rows.length==0&&isAdmin!=1){

      res.status(500).json({"error":"Internal Server erorr"})
      console.error(`no thing returned from the table for user ${userId}`)
      return
    }

    const canISearchBool=result.rows[0].can_search
    if(!canISearchBool && isAdmin!=1){

      res.status(402).json({"error":"sorry you are not allowed to get the rating "})
      console.error(`sorry you  ${userId} are not allowed to get the rating `)
      return
    }


    const same_group_id=await canUserAccessPackage(userId,packageId)

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
   


    await insertToPackageHistoryRating(userId,"RATE",packageId)

    res.status(200).json(packageRating)

    } catch (error) {


      console.error('Error fetching package rating:', error);
      if (error instanceof Error) {
          res.status(500).json({ message: `Internal server error: ${error.message}` });
      }
      res.status(500).json({ message: 'Internal server error' });
      
  }
  return 

}


export const getUserAccess=async (req:Request,res:Response)=>{
  const user_id=parseInt(req.params.user_id,10)
  if (!user_id) {
    res.status(400).json({ error: 'User ID is required and must be a valid number.' });
    return;
  }

  try{
  const isAdmin=await checkIfIamAdmin(req);
    
  if (isAdmin === -1) {
    res.status(401).json({ error: 'Unauthorized: Token missing or invalid.' });
    return;
  }

  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: Only admins can update user permissions.' });
    return;
  }

  const result =await get_user_acces(user_id)

  if(result.rows.length==0){

    res.status(402).json({error:"User Not Found"})
    console.log(`user ${user_id} not found`)
    return 

  }



  res.status(202).json(result.rows)
  console.log(`we get the acces for user ${user_id} sucessfull ` )
  return
  


  }catch(error){

    console.error('Error fetching package rating:', error);
    if (error instanceof Error) {
        res.status(500).json({ message: `Internal server error: ${error.message}` });
    }
    res.status(500).json({ message: 'Internal server error' });
    return

  }

  


}

export const updateUserAccess = async (req: Request, res: Response) => {
  const user_id = parseInt(req.params.user_id, 10);

  const { can_download = false, can_search = false, can_upload = false } = req.body;

  if (!user_id) {
    res.status(400).json({ error: 'User ID is required and must be a valid number.' });
    return;
  }

  if (
    typeof can_download !== 'boolean' ||
    typeof can_search !== 'boolean' ||
    typeof can_upload !== 'boolean'
  ) {
    res.status(400).json({ error: 'At least one valid permission (can_download, can_search, can_upload) must be provided.' });
    return;
  }

  try {
    const isAdmin = await checkIfIamAdmin(req);

    if (isAdmin === -1) {
      res.status(401).json({ error: 'Unauthorized: Token missing or invalid.' });
      return;
    }

    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden: Only admins can update user permissions.' });
      return;
    }

    try {
      const result = await update_user_acces(can_download, can_search, can_upload, user_id);

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      res.status(200).json({
        message: 'User permissions updated successfully.',
        user: result.rows[0],
      });
    } catch (err) {
      console.error('Error updating user permissions:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  } catch (err) {
    console.error('Error during permission update:', err);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
};


const get_code_files=(dir:string):string[]=>{

    let files:string[] = [];

    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items ){
      const itemPath = path.join(dir, item.name);


      if (item.isDirectory()) {
        // Recursively read subdirectories
        files = files.concat(get_code_files(itemPath));
      } else if (item.isFile() && (item.name.endsWith('.js'))) {
        
        files.push(itemPath);
      }
    }
    return files


  }



const debloat_file=async (dir:string)=>{

  const unnecessaryFiles = ['README.md', 'tests', '.eslintrc', 'docs', 'examples', '.github'];
  unnecessaryFiles.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
    }
  });

  let pathes=get_code_files(dir)

  for (const filePath of pathes) {
    const code = fs.readFileSync(filePath, 'utf8');
    try {
      const minified = await minify(code);
      fs.writeFileSync(filePath, minified.code || code); // Fallback to original if minification fails
    } catch (error) {
      // console.error(`Error minifying ${filePath}:`, error);
    }
  }
}




const get_npm_adjacency_list = async (packageName: string) => {
  const url = `https://registry.npmjs.org/${packageName}`;
  console.log(url)
  try {
      const response = await fetch(url);
      if (!response.ok) {
          throw new Error(`Could not fetch data for package: ${packageName}`);
      }

      const data = await response.json();
      const latestVersion = data['dist-tags'].latest;
      const dependencies = data.versions[latestVersion].dependencies || {};
      const packageSize = data.versions[latestVersion].dist.unpackedSize;

      // If the package is already in the adj_list, we skip it
      if (adj_list.has(packageName)) {
          return;
      }

      // Add the package to the adj_list with an empty Set of strings and num 0
      adj_list.set(packageName, { strings: new Set<string>(), num: packageSize });

      // Add each dependency to the strings Set
      for (const dependency of Object.keys(dependencies)) {
          // If the dependency is already in the adj_list, skip it
          if (adj_list.has(dependency)) {
              continue;
          }

          // Add the dependency to the current package's Set
          adj_list.get(packageName)!.strings.add(dependency);

          // Recursively fetch the adjacency list for the dependency
          await get_npm_adjacency_list(dependency);
      }
  } catch (error) {
      if (error instanceof Error) {
          console.error(error.message);
      }
  }
};


const get_npm_package_name=(path:string):string=>{

    let path_as_parts=path.split('/')
    return path_as_parts[path_as_parts.length-1]

}

let cost = new Map<string, number>();
const calculate_cost=(package_name:string)=>{
  let standaloneCost=adj_list.get(package_name)!.num
  let totalCost=standaloneCost
  for(const dep of adj_list.get(package_name)!.strings){


    calculate_cost(dep)
    totalCost=totalCost+(cost.get(dep)||0) //sum the standalone costs of the dependencies + the cost of
    
  
  }
  cost.set(package_name,totalCost)
}

const fetch_package_size = async (packageName: string): Promise<number> => {
    const url = `https://registry.npmjs.org/${packageName}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not fetch data for package: ${packageName}`);
        }

        const data = await response.json();
        const latestVersion = data['dist-tags'].latest;
        const size = data.versions[latestVersion].dist.unpackedSize;

        return size; // Size in bytes
    } catch (error) {
        console.error(`Error fetching size for ${packageName}:`, error);
        return 0; // Return 0 if there's an error
    }
};

const printingTheCost=async (package_name:string,flag:Bool)=>{
  //making the adj_list
  if (!flag)
    await get_npm_adjacency_list(package_name)
  
  calculate_cost(package_name)
  for(const pack of adj_list.keys()){
    console.log(`${pack}the standAlone Cost:${adj_list.get(pack)!.num} and the Total Cost:${cost.get(pack)}`)
  }
  

}

const get_repo_url=async(package_name:string)=>{


  const packageResponse = await axios.get(`https://registry.npmjs.org/${package_name}`);
  const repoUrl = packageResponse.data.repository?.url;

  if (repoUrl && repoUrl.includes('github.com')) {
      const cleanedRepoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
      
      return cleanedRepoUrl
  }

  return null

}

const githubPackagejson= async (url: string)=>{
  try{
    const repoData=await fetch(url)
    console.log(` repo data :${repoData}`)
    const repoName=getGitHubRepoNameFromUrl(url) as string
    
    if(!repoData.ok){
      throw new Error(`Could not fetch data for github url: ${url}`);
    }
    const findindBranch=await repoData.json()
    console.log(`findind branch: ${findindBranch}`)
    const sizeInKb = findindBranch.size
    const defaultBranch= findindBranch.default_branch
    const packagejsonURL=`url+/${defaultBranch}/package.json`
    console.log(`the package Json URL is ${packagejsonURL}`)
    const packagejsonResponse=await fetch(packagejsonURL)
    if(!packagejsonResponse.ok){
      throw new Error(`Could not fetch data for the package.json of github url: ${url}`);
    }
    const packagejson= await packagejsonResponse.json()
    const dependenciesSet = new Set(Object.keys(packagejson.dependencies))
    const devDependenciesSet = new Set(Object.keys(packagejson.devDependencies))
    const totaldependencies= new Set([...devDependenciesSet, ...dependenciesSet])
    adj_list.set(repoName, { strings: new Set<string>(), num: sizeInKb });
    for (const dep of totaldependencies){
      get_npm_adjacency_list(dep)
    }
    printingTheCost(repoName,true)
  }
  
  catch (error) {
    console.error("Error:", error);
  }
 
}

const getGitHubRepoNameFromUrl = (url: string): string | null => {
  const regex = /github\.com[\/:](.+?)\/([^\/]+)/;
  
  const match = url.match(regex);
  console.log("we are heerrrr")
  if (match) {
      return match[2]; // Return the repository name (second capture group)
  }
  return null; // Return null if the URL doesn't match the pattern
};


interface Payload{

  sub:number,isAdmin:boolean
}

export const registerNewUser = async (req: Request, res: Response) => {
  
  const { name, password, isAdmin, groupId,canDownload=false,canSearch=false,canUpload=false } = req.body;
  
  console.log(`Registering new user name:${name}`)

  if (!name || !password) {
     res.status(400).json({ error: 'Missing name or password.' });
     console.error(`missing name or password`)
     return
  }

  const client = await pool.connect(); // Use a client for the transaction

  try {
    await client.query('BEGIN'); // Start the transaction

    const isAdmin2=await checkIfIamAdmin(req)
    
    
    
    if (isAdmin2==-1) {
       res.status(401).json({ error: 'Unauthorized: Token missing.' });
       console.error(`token missing for user name :${name} maybe not admin`)
       return
    }

    // const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown;
    if (
      isAdmin2!=1
    ) {
       res.status(403).json({ error: 'Only admins can register users.' });
       console.error(`you are not an admin`)
       return
    }

    // Check if the user already exists
    const existingUserQuery = 'SELECT * FROM user_account WHERE name = $1';
    const existingUserResult = await client.query(existingUserQuery, [name]);

    if (existingUserResult.rows.length > 0) {
       res.status(409).json({ error: 'User with this name already exists.' });
       console.error(`user ${name} already exists`)
       return
    }

    // Hash the user's password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert the new user
    const insertUserQuery = `
      INSERT INTO user_account (name, password_hash, is_admin,can_download,can_search,can_upload)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const userInsertResult = await client.query(insertUserQuery, [name, hashedPassword, isAdmin || false,canDownload,canSearch,canUpload]);
    const userId = userInsertResult.rows[0].id;

    // Assign the user to the group (if groupId is provided)
    if (groupId) {
      const groupCheckQuery = 'SELECT * FROM user_groups WHERE id = $1';
      const groupResult = await client.query(groupCheckQuery, [groupId]);

      if (groupResult.rows.length === 0) {
        throw new Error('Group does not exist.');
      }

      const assignGroupQuery = `
        INSERT INTO user_group_membership (user_id, group_id)
        VALUES ($1, $2)
      `;
      await client.query(assignGroupQuery, [userId, groupId]);
    }

    await client.query('COMMIT'); // Commit the transaction
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    await client.query('ROLLBACK'); // Roll back the transaction
    console.error('Error during user registration:', error);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release(); // Release the client back to the pool
  }
};



export const assignPackageToGroup=async(req:Request,res:Response)=>{

    const groupId=req.params.groupid as unknown as number
    const {package_id}=req.body



    try{

      const isAdmin=await checkIfIamAdmin(req)
      
      
      if (isAdmin==-1) {
        res.status(401).json({ error: 'Unauthorized: Token missing.' });
        return
      }

      
      if (isAdmin!=1 ) {
          res.status(403).json({ error: 'Only admins can assign packages to group.' });
          console.error(`you are not an admin`)
          return
      }

      const checkGroupExistsFlag=await checkGroupExists(groupId)
      const checkPackageExistsFlag=await checkPackageExists(package_id)
      if(!checkGroupExistsFlag.rows.length||!checkPackageExistsFlag.rows.length){

          res.status(400).json({"error":"either group or package doesn't exists"})
          console.log(`either group ${groupId} or package ${package_id} doesn't exists`)
          return 

      }

      await assign_package_group(package_id,groupId)
      res.status(200).json({ message: "Package successfully assigned to group" });
      console.log(`Package ${package_id} successfully assigned to ${groupId}`)
      return 


    }catch(err){

      console.error("Error assigning package to group:", err);
      res.status(500).json({ error: "Internal server error" });
      return 
  
    } 



}



export const trackDetails=(req:Request,res:Response)=>{

  try {
    
    const plannedTracks = ["Access control track"];

    
    res.status(200).json({ plannedTracks });
  } catch (error) {
    console.error('Error in /tracks endpoint:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }



}


export const createGroup=async(req:Request,res:Response)=>{

  const {name}=req.body;

  if(!name){
    res.status(401).json({error:"missing name"})
    return
  }

  const results=await getAllGroupsWithName(name)

  if(results.rows.length>0){

    res.status(400).json({error:"this group  already exists"})
    console.error(`group with name ${name} already exists`)
    return 
  }

  try{

  
  const group=await insertToGroups(name)
  console.log(`we inserted group ${name} with id ${group.rows[0].id}`)
  res.status(202).json({id:group.rows[0].id})

  }catch(err){

    res.status(500).json({error:"internal server error"})
    console.error(`internal server error`)
  }
  
}


export const assignUserToGroup=async(req:Request,res:Response)=>{

  const groupId=parseInt(req.params.groupid,10)
  
  const {user_id}=req.body
  console.log(`we are adding ${user_id} to group ${groupId}`)
  if (!groupId || !user_id) {
     res.status(400).json({ error: "Missing group ID or user ID" });
     return
  }

  try {
    // Check if the group exists
    const isAdmin=await checkIfIamAdmin(req)
    
    
    if (isAdmin==-1) {
      res.status(401).json({ error: 'Unauthorized: Token missing.' });
      return
    }
    
    
    if (isAdmin!=1) {
        res.status(403).json({ error: 'Only admins can assign users to group.' });
        console.error(`you are not an admin`)
        return
    }
    const groupExists = await doesGroupExist(groupId);
    if (!groupExists) {
      
       res.status(404).json({ error: "Group does not exist" });
       console.error(`group with id ${groupId} doesn't exists`)
       return
    }

    // Check if the user exists
    const userExists = await doesUserExist(user_id);
    if (!userExists) {
      res.status(404).json({ error: "User does not exist" });
      return 
    }

    
    const isUserInGroup = await isUserAlreadyInGroup(user_id);
    if (isUserInGroup) {

       await updateUserGroup(user_id,groupId)
       res.status(409).json({ message: `User assigned to a new group ${groupId}`});
       console.log(`User ${user_id} assigned to a new group ${groupId}`)
       return
    }
    
    await insertUserToGroup(user_id, groupId);

    res.status(201).json({ message: "User added to the group successfully" });
    console.log(`user ${user_id} is added successfully to ${groupId}`)
  } catch (error) {
    console.error("Error adding user to group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


  

export const getAllGroups = async (req: Request, res: Response) => {
  console.log("Getting all groups available...");

  const amIAdmin = await checkIfIamAdmin(req);
  if (amIAdmin === -1) {
    res.status(401).json({ error: "Token missing or invalid" });
    console.error("Token missing or invalid");
    return;
  }

  if (!amIAdmin) {
    res.status(403).json({ error: "Forbidden: Only admins can view all groups" });
    console.error("User is not an admin");
    return;
  }

  try {
    const results = await getAllGroupsQuery();
    res.status(200).json(results.rows); // Return only the rows
  } catch (error) {
    console.error("Error fetching all groups:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const logout = async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(400).json({ error: 'Token is missing.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);

    
    await removeUserToken(token);

    res.status(200).json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('Error during logout:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getUsersByGroup=async(req:Request,res:Response)=>{

  console.log("we are getting user by groups ")
  const groupId=parseInt(req.params.groupid ,10)

  if (!groupId){

    res.status(402).json({"error":"group id missing"})
    console.log(`group id missing`)
    return 

  }

  try{

  const amIAdmin = await checkIfIamAdmin(req);
  if (amIAdmin === -1) {
    res.status(401).json({ error: "Token missing or invalid" });
    console.error("Token missing or invalid");
    return;
  }

  if (!amIAdmin) {
    res.status(403).json({ error: "Forbidden: Only admins can view users by groups" });
    console.error("User is not an admin");
    return;
  }


  const results=await getUsersByGroupQuery(groupId)
  res.status(202).json(results.rows)
  console.log(`we got  users by Groups successfully`)
  return 
  }catch(err){

    res.status(500).json({"error":`internal server error ${err}`})
    console.log(`error happened while getting users by groups: ${err}`)

  }



}



export const authenticate = async (req: Request, res: Response) => {
  const { User, Secret } = req.body;
  console.log(`we start authenticating with User ${User} and Secret: ${Secret}`)

  if (!User || !User.name || !Secret || !Secret.password) {
    res.status(400).json({ error: 'Missing username or password.' });
    console.error(`missing user name or password`)
    return;
  }

  try {
    const result = await getAllUsersWithName(User.name);
    if (result.rows.length == 0) {
      res.status(401).json({ error: 'Username is incorrect.' });
      console.error(`userName ${User} is incorret`) 
      return;
    }

    const user = result.rows[0];

    // Verify the password
    const isPasswordValid = await bcrypt.compare(Secret.password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Password is incorrect.' });
      console.error(`password for userName ${User} is incorret`)
      return;
    }

    // Generate the JWT token
    const token = jwt.sign(
      { sub: user.id, isAdmin: user.is_admin }, // Payload with user ID and admin status
      process.env.JWT_SECRET as string,        // Secret key from .env
      { expiresIn: '10h' }                     // Token expiration time
    );

    // Calculate token expiration date
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 10); // Token valid for 10 hours

    // Insert the token into the user_tokens table
    await insertToUserToken(user.id, token, expirationDate.toISOString());
    console.log(`we inserted the token`)
    // Send the token back to the user
    res.status(200).json({ token: `Bearer ${token}` });
  } catch (err) {
    console.error('Error during authentication:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};







const costOfGithubUrl= async (url:string, sizeInB: number,totaldependencies: Set<string>)=>{
  try{
   
    const repoName=getGitHubRepoNameFromUrl(url) as string
    adj_list.set(repoName, { strings: new Set<string>(), num: sizeInB });
    for (const dep of totaldependencies){
      get_npm_adjacency_list(dep)
    }
    printingTheCost(repoName,true)
  }
  
  catch (error) {
    console.error("Error:", error);
  }
  
}
const findPackageJson = (dir: string): string | null => {
  const files = fs.readdirSync(dir); // Read files in the current directory

  for (const file of files) {
      const fullPath = path.join(dir, file);

      // If it's a directory, recursively search inside it
      if (fs.statSync(fullPath).isDirectory()) {
          const result = findPackageJson(fullPath);
          if (result) {
              return result;
          }
      }
      // If package.json is found, return its full path
      if (file === 'package.json') {
          return fullPath;
      }
  }

  return null; // Return null if package.json is not found
};

const getDirectorySize = (dirPath: string): number => {
  let totalSize = 0;

  // Get all files and subdirectories in the directory
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath); // Get stats for the current file

      if (stat.isDirectory()) {
          // If it's a directory, recurse into it
          totalSize += getDirectorySize(fullPath);
      } else {
          // If it's a file, add its size to the total
          totalSize += stat.size;
      }
  }

  return totalSize;
};

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
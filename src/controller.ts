// controller.ts
import e, { Request, Response } from 'express';
import http from "isomorphic-git/http/node/index.js";
import axios from 'axios';
import * as git from 'isomorphic-git'
import fs from 'fs'
import {minify} from 'terser'
import os, { tmpdir, version } from "os"
import path from "path"
import AdmZip from 'adm-zip' 
import archiver from "archiver"; // Import archiver for zipping
import pool from './db.js'; // Adjust the path according to your project structure
import {processUrl} from './phase_1/cli.js'
import {
  getPackageByIDQuery,
  insertPackageQuery,
  resetRegistryQuery,  // New 
  searchPackagesByRegExQuery,
  insertIntoPackageData,
  insertPackageRating,
  
  getNameVersionById,
  getLatestPackage,
  getPackageRatingQuery, // New
} from './queries.js';


import { downloadFromS3, uploadBase64ToS3, uploadZipToS3 } from './s3.js';
import { error } from 'console';


// Initialize the logger

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
    res.status(200).json({error:'Registry is reset'});
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
let adj_list = new Map<string, {strings: Set<string>, num: number}>();


  export const uploadPackage = async (req: Request, res: Response) => {
    let { Name, Content, JSProgram, debloat, URL } = req.body;
    console.log(`Name is ${Name}`)
    console.log(`Content is ${Content}`)
    console.log(`JSPrgogg ${JSProgram}`)
    console.log(`debloat ${debloat}`)
    console.log(`URL ${URL}`)

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

      let dependencies=new Set<string>
      if (Content) {
        
        // now we need to deploat but first unzipping 

        const content_as_base64=Buffer.from(Content,"base64")
        const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
        fs.writeFileSync(zipPath, content_as_base64);



        const path_after_unzipping = path.join(os.tmpdir(), `package-${id}`);
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(path_after_unzipping, true); // Unzip to tempDir
        console.log("Unzipped content to temporary directory.");

        if (debloat) {
          await debloat_file(path_after_unzipping); // Use your debloat/minification function
          console.log("Debloated package contents.");
        }


        const debloat_package_zipped_path=path.join(os.tmpdir(), `debloated-package-${id}.zip`);
        await zipDirectory(path_after_unzipping,debloat_package_zipped_path)

        const finalZipContent = fs.readFileSync(debloat_package_zipped_path);
        const base64FinalContent = finalZipContent.toString('base64');




        
        
        await uploadBase64ToS3(base64FinalContent,  key);

        
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
        const metrics=await processUrl(URL)
        console.log(metrics)
        if ((metrics?.NetScore||0)<0.5){

          res.status(424).json({"error":"disqualified package"})
          return 
        }

        
        await insertPackageRating(client, id,metrics?.Correctness,metrics?.ResponsiveMaintainer
          ,metrics?.RampUp,metrics?.BusFactor,metrics?.License
          ,-1,metrics?.CodeReview,metrics?.Correctness_Latency,metrics
          ?.ResponsiveMaintainer_Latency,metrics?.RampUp_Latency,metrics?.BusFactor_Latency,metrics
          ?.License_Latency,-1,metrics?.CodeReviewLatency,metrics?.NetScore ,metrics?.NetScore_Latency

        );

        

        if(!URL.includes("github")){
          console.log("not github")
          let package_name=get_npm_package_name(URL)
          await printingTheCost(package_name)
          
          // await get_npm_adjacency_list(package_name)
          for (const x of adj_list){
            console.log(x)
          }

          
          URL=await get_repo_url(package_name)
          console.log(`the got url is ${URL}`)
        }

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

        if(debloat){

          await debloat_file(tempDir)
        }


        const zipPath = path.join(os.tmpdir(), `repo-${id}.zip`);
        await zipDirectory(tempDir, zipPath);
        console.log(`Zipped repository to ${zipPath}`);
        const fileStream = fs.createReadStream(zipPath);
        uploadZipToS3(key,fileStream,'application/zip')


        const zipFileContent = fs.readFileSync(zipPath);
        const base64Content = zipFileContent.toString('base64');

        await insertIntoPackageData(client, id, '', URL, debloat, JSProgram);
        


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
  console.log(`id from get Package by id is ${id}`);

  const client = await pool.connect();
  try {
    console.log("we are inside try")
    await client.query("BEGIN");
    console.log("after beging")

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


export const get_package_rating=async (req:Request,res:Response)=>{

  const packageId:number = req.params.id as unknown as number;  // Extracting the path parameter

  try{
    if (!packageId){
      res.status(400).json({error:"can't get package id "})
    }

    const metrics=await getPackageRatingQuery(packageId)  

    if (metrics.rows.length==0){

      res.status(404).json({error:"Package doesn't exists"})
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
      console.log(`Minified ${filePath}`);
    } catch (error) {
      console.error(`Error minifying ${filePath}:`, error);
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

const printingTheCost=async (package_name:string)=>{
  //making the adj_list
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

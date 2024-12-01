// controller.ts
import e, { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs'
import {minify} from 'terser'
import jwt from 'jsonwebtoken';
import path, { parse } from "path"
import archiver from "archiver";
import pool from '../db.js'; 
import { Bool } from 'aws-sdk/clients/clouddirectory.js';



// import { Pool } from 'pg';
// const pool = new Pool();
let adj_list = new Map<string, {strings: Set<string>, num: number}>();

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
  } catch (error) {
    
    console.error("Token verification failed:", error);
    return -1; // Invalid token
  }
};


export const get_code_files=(dir:string):string[]=>{

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



export const debloat_file=async (dir:string)=>{

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




export const get_npm_adjacency_list = async (packageName: string) => {
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


export const get_npm_package_name=(path:string):string=>{

    let path_as_parts=path.split('/')
    return path_as_parts[path_as_parts.length-1]

}

let cost = new Map<string, number>();
export const calculate_cost=(package_name:string)=>{
  let standaloneCost=adj_list.get(package_name)!.num
  let totalCost=standaloneCost
  for(const dep of adj_list.get(package_name)!.strings){


    calculate_cost(dep)
    totalCost=totalCost+(cost.get(dep)||0) //sum the standalone costs of the dependencies + the cost of
    
  
  }
  cost.set(package_name,totalCost)
}

export const fetch_package_size = async (packageName: string): Promise<number> => {
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

export const printingTheCost=async (package_name:string,flag:Bool)=>{
  //making the adj_list
  if (!flag)
    await get_npm_adjacency_list(package_name)
  
  calculate_cost(package_name)
  for(const pack of adj_list.keys()){
    console.log(`${pack}the standAlone Cost:${adj_list.get(pack)!.num} and the Total Cost:${cost.get(pack)}`)
  }
  

}

export const get_repo_url=async(package_name:string)=>{


  const packageResponse = await axios.get(`https://registry.npmjs.org/${package_name}`);
  const repoUrl = packageResponse.data.repository?.url;

  if (repoUrl && repoUrl.includes('github.com')) {
      const cleanedRepoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
      
      return cleanedRepoUrl
  }

  return null

}

export const githubPackagejson= async (url: string)=>{
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

export const getGitHubRepoNameFromUrl = (url: string): string | null => {
  const regex = /github\.com[\/:](.+?)\/([^\/]+)/;
  
  const match = url.match(regex);
  console.log("we are heerrrr")
  if (match) {
      return match[2]; // Return the repository name (second capture group)
  }
  return null; // Return null if the URL doesn't match the pattern
};


export  const trackDetails=(req:Request,res:Response)=>{

  try {
    
    const plannedTracks = ["Access control track"];

    
    res.status(200).json({ plannedTracks });
  } catch (error) {
    console.error('Error in /tracks endpoint:', error);
    res.status(500).json({ message: 'The system encountered an error while retrieving the student\'s track information.' });
  }



}

export const costOfGithubUrl= async (url:string, sizeInB: number,totaldependencies: Set<string>)=>{
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
export const findPackageJson = (dir: string): string | null => {
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

export const getDirectorySize = (dirPath: string): number => {
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

export const zipDirectory = async (source: string, out: string) => {
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

export const get_current_date=()=>{

  const currentDateTime = new Date();

  // Extract year, month, day, hour, and minute
  const year = currentDateTime.getFullYear();
  const month = String(currentDateTime.getMonth() + 1).padStart(2, '0'); // Months are 0-based
  const day = String(currentDateTime.getDate()).padStart(2, '0');
  const hour = String(currentDateTime.getHours()).padStart(2, '0');
  const minute = String(currentDateTime.getMinutes()).padStart(2, '0');

  // Combine them into the desired format
  const formattedDateTime = `${year}-${month}-${day} ${hour}:${minute}`;

  return formattedDateTime

}


export const isValidIdFormat = (input: string): boolean => {
  const regex = /^[a-zA-Z0-9\-]+$/;
  return regex.test(input);
};



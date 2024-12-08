// controller.ts
import e, { NextFunction, Request, Response } from 'express';
import axios from 'axios';

import fs from 'fs'
import {minify} from 'terser'
import { promises as fss } from 'fs';
import jwt from 'jsonwebtoken';
import { marked } from 'marked';

import path, { parse } from "path"
import archiver from "archiver";
import pool from '../db.js'; 
import {log} from '../phase_1/logging.js'
import { PoolClient } from 'pg';
import timeout from 'connect-timeout';
import { insertPackageDependency } from '../queries/packages_queries.js';


const TIMEOUT_DURATION = '600s'; 


export const checkIfIamAdmin = async (req: Request)=>{
  const authHeader = req.headers['x-authorization'] as string;
  
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
    
    log(`Token verification failed:${error}`);
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
      // log(`Error minifying ${filePath}:`, error);
    }
  }
}


export const get_npm_adjacency_list = async (
  packageName: string,
  adj_list: Map<string, { strings: Set<string>; num: number }>
) => {
  const normalizedPackageName = packageName.toLowerCase(); // Normalize package name
  const url = `https://registry.npmjs.org/${normalizedPackageName}`;
  log(url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not fetch data for package: ${normalizedPackageName}`);
    }

    const data = await response.json();
    const latestVersion = data['dist-tags'].latest;
    const dependencies = data.versions[latestVersion].dependencies || {};
    const packageSize = data.versions[latestVersion].dist?.unpackedSize || 0;

    // Skip if already processed
    if (adj_list.has(normalizedPackageName)) {
      return;
    }

    // Add the package to the adj_list
    adj_list.set(normalizedPackageName, { strings: new Set<string>(), num: packageSize });

    // Process dependencies
    for (const dependency of Object.keys(dependencies)) {
      const normalizedDependency = dependency.toLowerCase();

      // Skip already processed dependencies
      if (!adj_list.has(normalizedDependency)) {
        adj_list.get(normalizedPackageName)!.strings.add(normalizedDependency);

        // Recursive call for the dependency
        try {
          await get_npm_adjacency_list(normalizedDependency, adj_list);
        } catch (error) {
          console.error(`Error processing dependency ${normalizedDependency}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing package ${packageName}:`, error);
  }
};

export const get_npm_package_name=(path:string):string=>{

    let path_as_parts=path.split('/')
    return path_as_parts[path_as_parts.length-1]

}

let cost = new Map<string, number>();

export const calculate_cost = (
  package_name: string,
  adj_list: Map<string, { strings: Set<string>; num: number }>,
  cost: Map<string, number>,
  visited = new Set<string>() // Track visited packages
): void => {
  if (cost.has(package_name)) {
    return; // Skip already calculated packages
  }

  const packageData = adj_list.get(package_name);
  if (!packageData) {
    console.warn(`Package ${package_name} not found in adj_list`);
    return; // Skip missing packages
  }

  const standaloneCost = packageData.num ?? 0; // Default to 0 if undefined
  let totalCost = standaloneCost;

  if (visited.has(package_name)) {
    console.warn(`Circular dependency detected: Skipping ${package_name}`);
    return; // Skip circular dependencies
  }

  visited.add(package_name);

  for (const dep of packageData.strings) {
    if (!adj_list.has(dep)) {
      console.warn(`Dependency ${dep} not found for package: ${package_name}`);
      continue; // Skip missing dependencies
    }
    calculate_cost(dep, adj_list, cost, visited);
    totalCost += cost.get(dep) || 0; // Add only valid costs
  }

  cost.set(package_name, totalCost);
  visited.delete(package_name); // Remove from visited after processing
};



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
        log(`Error fetching size for ${packageName}:${error}` );
        return 0; // Return 0 if there's an error
    }
};

export const printingTheCost = async (
  package_id:Number,
  package_name: string,
  adj_list: Map<string, { strings: Set<string>; num: number }>,
  client: PoolClient
) => {
  // Map to store calculated costs
  let cost = new Map<string, number>();

  // Calculate costs for all packages
  calculate_cost(package_name, adj_list, cost);

  // Insert package dependencies into the database
  for (const pack of adj_list.keys()) {
    const standaloneCost = adj_list.get(pack)!.num ?? 0; // Default to 0 if undefined
    const totalCost = cost.get(pack) ?? 0; // Default to 0 if undefined

    try {
      await insertPackageDependency(client, package_id, pack, standaloneCost, totalCost);
      log(`${pack} - Standalone Cost: ${standaloneCost}, Total Cost: ${totalCost}`);
    } catch (error) {
      console.error(`Error inserting dependency for ${pack}:, error`);
    }
  }
};




export const get_repo_url=async(package_name:string)=>{


  const packageResponse = await axios.get(`https://registry.npmjs.org/${package_name}`);
  const repoUrl = packageResponse.data.repository?.url;

  if (repoUrl && repoUrl.includes('github.com')) {
      const cleanedRepoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
      
      return cleanedRepoUrl
  }

  return null

}



export const getGitHubRepoNameFromUrl = (url: string): string | null => {
  const regex = /github\.com[\/:](.+?)\/([^\/]+)/;
  
  const match = url.match(regex);
  log("we are heerrrr")
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
    log(`Error in /tracks endpoint: ${error}`);
    res.status(500).json({ message: 'The system encountered an error while retrieving the student\'s track information.' });
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




export const getPackagesFromPackageJson = (dir: string): string[] => {
  const packagesList: string[] = [];
  const packageJsonPath = getPackageJson(dir);

  if (packageJsonPath) {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Extract dependencies if they exist
      if (packageJson.dependencies) {
        packagesList.push(...Object.keys(packageJson.dependencies));
      }

    } else {
      console.error(`No 'package.json' found at path: ${packageJsonPath}`);
    }
  } else {
    console.error(`error`);
  }

  return packagesList;
};

export const getNameFromPackageJson=(dir: string): string=> {
  log("We are getting the name from package.json")
  const packageJsonPath=getPackageJson(dir)
  let packageName = ''as string;
  if(packageJsonPath){
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        // Extract dependencies and devDependencies if they exist
        if (packageJson.name ){
          packageName=packageJson.name
        }
        else if (packageJson.Name){
          packageName=packageJson.Name
        }
        else {
          packageName="no name"
          console.error('There is no name in package.json so we will use the name of the github repo or the name of the npm package');
        }
    } else {
        console.error(`No 'package.json' found at path: ${packageJsonPath}`);
    }
  }
  else {
    console.error(`error`)
  }
  log(`the returned name is ${packageName}`)
  return packageName;
}
export const getURLFromPackageJson=(dir: string): string=> {
  log("We are getting the name from package.json")
  const packageJsonPath=getPackageJson(dir)
  let packageURL = ''as string;
  if(packageJsonPath){
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        // Extract dependencies and devDependencies if they exist
        if (packageJson.url ){
          packageURL=packageJson.url
        }
        else if (packageJson.Url){
          packageURL=packageJson.Url
        }
        else if (packageJson.repository && packageJson.repository.url) {
          const repoUrl = packageJson.repository.url; // git://github.com/dominictarr/JSONStream.git
           packageURL = repoUrl
            .replace(/^git:\/\//, 'https://')  // Replace 'git://' with 'https://'
            .replace(/\.git$/, '') 
            .replace(/^git\+/, "");      // Remove the '.git' at the end
          console.log(`You can view the repository at: ${packageURL}`);
        }
        else {
          packageURL="no url"
          console.error('There is no url in package.json');
        }
    } else {
        console.error(`No 'package.json' found at path: ${packageJsonPath}`);
    }
  }
  else {
    console.error(`error`)
  }
  log(`the returned url is ${packageURL}`)
  return packageURL;
}


const getPackageJson=(dir: string): string | null=> {
  const files = fs.readdirSync(dir); // Read files in the current directory

  if( files.includes("package.json")){
    return path.join(dir, "package.json");
  }
  for (const file of files) {
      const fullPath = path.join(dir, file);

      

      
      // If it's a directory, recursively search inside it
    
      // If the file is 'package.json', return its path
      if (file === 'package.json') {
          log(`full path is ${fullPath}`)
          return fullPath;
      }
      if (fs.statSync(fullPath).isDirectory()) {
        const result = getPackageJson(fullPath);
        if (result) {
            return result; // Found the package.json
        }
      }

  }

  return null; // Return null if 'package.json' is not found
}


export async function encodeFileToBase64(filePath:string) {
  try {
    const zipFileContent = await fss.readFile(filePath);
    return zipFileContent.toString('base64'); // Return the Base64 string
  } catch (error) {
    console.error('Error reading or encoding file:', error);
    throw error;
  }
}


export const sanitizeRegexRepetition = (regex: string, maxRepetition: number = 50): string => {
  // Match patterns like {min,max}, {min,}, {,max}, or {n}
  return regex.replace(/(\{\s*\d*\s*,?\s*)(\d+)?\s*}/g, (match, prefix, upperBound) => {
    if (upperBound) {
      const sanitizedUpperBound = Math.min(parseInt(upperBound, 10), maxRepetition);
      return `${prefix}${sanitizedUpperBound}}`;
    }
    // If no upper bound is specified, set it to maxRepetition
    return `${prefix}${maxRepetition}}`;
  });
};

export const isFullMatchRegex = (regex: string): boolean => {
  // Check if the regex explicitly starts with ^ and ends with $
  const fullMatchExplicit = regex.startsWith('^') && regex.endsWith('$');

  return fullMatchExplicit;
};


export const modifyRegexForSubstringMatch = (regex: string, isFullMatch: boolean): string => {
  if (isFullMatch) {
    return regex; // No modification needed for full match
  }

  let modifiedRegex = regex;

  // Add .* to the start if not present
  if (!/^(\.\*)/.test(modifiedRegex)) {
    modifiedRegex = `.*${modifiedRegex}`;
  }

  // Add .* to the end if not present
  if (!/(\.\*)$/.test(modifiedRegex)) {
    modifiedRegex = `${modifiedRegex}.*`;
  }

  return modifiedRegex;
};

export function removeEscapingBackslashes(password:string) {
  return password.replace(/\\(.)/g, '$1');
}


export const extractReadmeAsync = async (extractedPath: string): Promise<string | null> => {
  try {
    const files = await fss.readdir(extractedPath); // Read files in the extracted directory
    const readmeFile = files.find((file) => file.toLowerCase().startsWith('readme')); // Locate README

    if (readmeFile) {
      const readmePath = path.join(extractedPath, readmeFile);

      // Await the promise returned by readFile
      const readmeContent = await fss.readFile(readmePath, 'utf8');
      log(`README file found: ${readmePath}`);

      // Convert Markdown to plain text
      const plainTextReadme = await markdownToText(readmeContent);

      // Return the plain text content
      return plainTextReadme;
    }

    log(`No README file found in extracted package`);
    return null;
  } catch (error) {
    console.error(`Error processing README: ${error}`);
    return null;
  }
};


const markdownToText = async(markdown: string) => {
  // Convert Markdown to HTML
  const htmlContent = await marked(markdown);

  // Strip HTML tags to get plain text
  const plainText = htmlContent.replace(/<[^>]*>/g, '');

  return plainText.trim();
};





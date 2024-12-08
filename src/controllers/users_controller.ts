
import jwt from 'jsonwebtoken';
import e, { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db.js'; 
import { checkIfIamAdmin, removeEscapingBackslashes } from './utility_controller.js';
import {  getAllUsersWithNameQuery, getUserAccessQuery, getUserWithUserNameQuery, insertToUserTokenQuery, insertUserToUsersQuery, removeUserTokenQuery, updateTokenQuery, updateUserAccessQuery } from '../queries/users_queries.js';
import { doesGroupExistQuery, insertUserToGroupQuery } from '../queries/groups_queries.js';
import {log} from '../phase_1/logging.js'



const MAX_CALLS=1000
export const registerNewUser = async (req: Request, res: Response) => {
  
    const { name, password, isAdmin, groupId,canDownload=false,canSearch=false,canUpload=false } = req.body;
    
    log(`Registering new user name:${name}`)
  
    if (!name || !password) {
       res.status(400).json({ error: 'Missing name or password.' });
       log(`missing name or password`)
       return
    }
  
    const client = await pool.connect(); 
  
    try {
      await client.query('BEGIN'); 
  
      const isAdmin2=await checkIfIamAdmin(req)
      

      if (isAdmin2==-1) {
         res.status(401).json({ error: 'Unauthorized: Token missing. or expired ' });
         log(`token missing for user name :${name} maybe not admin`)
         return
      }
  
      if (
        isAdmin2!=1
      ) {
         res.status(403).json({ error: 'Only admins can register users.' });
         log(`you are not an admin`)
         return
      }
  
      
      const existingUserResult = await getUserWithUserNameQuery(client,name)
  
      if (existingUserResult.rows.length > 0) {
         res.status(409).json({ error: 'User with this name already exists.' });
         log(`user ${name} already exists`)
         return
      }
  
      
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      
      
      const userInsertResult = await insertUserToUsersQuery(client,name,hashedPassword,isAdmin,canDownload,canSearch,canUpload)
      const userId = userInsertResult.rows[0].id;
  
      
      if (groupId) {
       
        const groupResult = await doesGroupExistQuery(groupId,client);
  
        if (!groupResult) {
          res.status(409).json({error:"This group doesn't exist"})
          return
        }

        insertUserToGroupQuery(userId,groupId,client)

      }
  
      await client.query('COMMIT'); 
      res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
      await client.query('ROLLBACK'); 
      log(`Error during user registration:${error}`, );
      res.status(500).json({ error: 'Internal server error.' });
    } finally {
      client.release(); 
    }
  };
  
  
export const authenticate = async (req: Request, res: Response) => {
    const { User, Secret } = req.body;
    log(`we start authenticating with User ${User} and Secret: ${Secret}`)
  
    if (!User || !User.name || !Secret || !Secret.password) {
      res.status(400).json({ error: 'There is missing field(s) in the AuthenticationRequest or it is formed improperly.' });
      log(`missing user name or password`)
      return;
    }
    const new_password=removeEscapingBackslashes(Secret.password)
    log(`password is ${new_password} instead of ${Secret.password}`)
    try {
      const result = await getAllUsersWithNameQuery(User.name);
      if (result.rows.length == 0) {
        res.status(401).json({ error: 'The user or password is invalid.' });
        log(`userName ${User} is incorret`) 
        return;
      }
  
      const user = result.rows[0];
  
      // Verify the password
      
      const isPasswordValid = await bcrypt.compare(new_password, user.password_hash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'The user or password is invalid.' });
        
        log(`password for userName ${User.name} is incorret`)
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
      await insertToUserTokenQuery(user.id, token, expirationDate.toISOString());
      log(`we inserted the token`)
      // Send the token back to the user
      res.type("text/plain");
      
      res.send(` Bearer ${token} `);
    } catch (err) {
      log(`Error during authentication:${err}` );
      res.status(500).json({ error: 'Internal server error.' });
    }
  };  
  

export const logout = async (req: Request, res: Response) => {
    // const authHeader = req.headers['x-authorization'] as string;
    // const token = authHeader && authHeader.split(' ')[1];
  
    // if (!token) {
    //   res.status(400).json({ error: 'Token is missing.' });
    //   return;
    // }
  
    try {
      // const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
      
      
      // await removeUserTokenQuery(token);
  
      res.status(200).json({ message: 'Logged out successfully.' });
    } catch (err) {
      log(`Error during logout:${err}`);
      res.status(500).json({ error: 'Internal server error.' });
    }
};



export const getUserAccess=async (req:Request,res:Response)=>{
  const user_id=parseInt(req.params.user_id,10)
  if (!user_id) {
    res.status(400).json({ error: 'User ID is required and must be a valid number.' });
    return;
  }

  try{
  const isAdmin=await checkIfIamAdmin(req);
    
  if (isAdmin === -1) {
    res.status(401).json({ error: 'Unauthorized: Token missing or invalid. or expired' });
    return;
  }

  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: Only admins can update user permissions.' });
    return;
  }

  const result =await getUserAccessQuery(user_id)

  if(result.rows.length==0){

    res.status(402).json({error:"User Not Found"})
    log(`user ${user_id} not found`)
    return 

  }



  res.status(202).json(result.rows)
  log(`we get the acces for user ${user_id} sucessfull ` )
  return
  


  }catch(error){

    log(`Error fetching package rating:error`);
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
      res.status(401).json({ error: 'Unauthorized: Token missing or invalid or expired' });
      return;
    }

    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden: Only admins can update user permissions.' });
      return;
    }

    try {
      const result = await updateUserAccessQuery(can_download, can_search, can_upload, user_id);
      
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      res.status(200).json({
        message: 'User permissions updated successfully.',
        user: result.rows[0],
      });
    } catch (err) {
      log(`Error updating user permissions:${err}` );
      res.status(500).json({ error: 'Internal server error.' });
    }
  } catch (err) {
    log(`Error during permission update:err`);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
};





export const enforceTokenUsage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['x-authorization'] as string;
    const token = authHeader?.split(' ')[1]; // Extract token from "Bearer <token>"

    if (!token) {
      res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
      log('Access denied: Missing token');
      return;
    }

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    } catch (err) {
      res.status(403).json({ error: 'Authentication failed due to invalid or missing AuthenticationToken.' });
      log('Access denied: Invalid or expired token');
      return;
    }

    // Optional: Attach user info to request object for downstream use
    
    // Atomically increment usage_count and retrieve the new count
   
    const result=await updateTokenQuery(token)

    if(!result.rows.length){
      res.status(403).json({
        error: `Authentication failed due to invalid or missing AuthenticationToken.`,
      });
      log("token is deleted")
      return
    }

    const usageCount = result.rows[0].usage_count;

    if (usageCount > MAX_CALLS) {
      // Exceeded the maximum allowed usage
      // Optionally, delete the token from user_tokens table to invalidate it
      await removeUserTokenQuery(token)
      res.status(403).json({
        error: `Authentication failed due to invalid or missing AuthenticationToken.`,
      });
      log(`Access denied: Token usage limit exceeded for token ${token}`);
      return;
    }

    log(`Token usage incremented: ${usageCount}/${MAX_CALLS}`);

    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error('Rate limiter error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


import jwt from 'jsonwebtoken';
import e, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db.js'; 
import { checkIfIamAdmin } from './utility_controller.js';
import { getAllUsersWithNameQuery, getUserAccessQuery, insertToUserTokenQuery, removeUserTokenQuery, updateUserAccessQuery } from '../queries/users_queries.js';

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
         res.status(401).json({ error: 'Unauthorized: Token missing. or expired ' });
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
  
  
export const authenticate = async (req: Request, res: Response) => {
    const { User, Secret } = req.body;
    console.log(`we start authenticating with User ${User} and Secret: ${Secret}`)
  
    if (!User || !User.name || !Secret || !Secret.password) {
      res.status(400).json({ error: 'Missing username or password.' });
      console.error(`missing user name or password`)
      return;
    }
  
    try {
      const result = await getAllUsersWithNameQuery(User.name);
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
      await insertToUserTokenQuery(user.id, token, expirationDate.toISOString());
      console.log(`we inserted the token`)
      // Send the token back to the user
      res.status(200).json({ token: `Bearer ${token}` });
    } catch (err) {
      console.error('Error during authentication:', err);
      res.status(500).json({ error: 'Internal server error.' });
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
  
      
      await removeUserTokenQuery(token);
  
      res.status(200).json({ message: 'Logged out successfully.' });
    } catch (err) {
      console.error('Error during logout:', err);
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
      console.error('Error updating user permissions:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  } catch (err) {
    console.error('Error during permission update:', err);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
};



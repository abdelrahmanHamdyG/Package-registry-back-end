
import { PoolClient } from 'pg';
import pool from '../db.js'; // Adjust the path according to your project structure
import { bool } from 'aws-sdk/clients/signer.js';
import {log} from '../phase_1/logging.js'


export const canIReadQuery=async (user_id:number)=>{

    const userQuery = `
    SELECT can_download 
    FROM user_account 
    WHERE id = $1
  `;
  
  return await pool.query(userQuery,[user_id])
  }
  
  
  export const removeUserTokenQuery = async (token: string) => {
    const query = `DELETE FROM user_tokens WHERE token = $1`;
    return pool.query(query, [token]);
  };
  
  export const  checkIfTokenExistsQuery=async(token:string)=>{
  
    const query = `SELECT * FROM user_tokens WHERE token = $1`;
    return pool.query(query, [token]);
  
  } 
  

  export const canISearchQuery=async (user_id:number)=>{

    const userQuery = `
    SELECT can_search 
    FROM user_account 
    WHERE id = $1
  `;
  
  return await pool.query(userQuery,[user_id])
  
  }
  
  
  export const canIUploadQuery=async (user_id:number)=>{
  
    const userQuery = `
    SELECT can_upload 
    FROM user_account 
    WHERE id = $1
  `;
  
  return await pool.query(userQuery,[user_id])
  
  }
  

  
export const getAllUsersWithNameQuery=(name:string)=>{

    const query=`SELECT * from user_account WHERE name= $1`
    return pool.query(query,[name])
  
  }
  
  
  export const doesUserExistQuery = async (userId: number): Promise<boolean> => {
    const query = `
      SELECT 1 FROM user_account
      WHERE id = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows.length > 0;
  };
  
  export const insertToUserTokenQuery = async (user_id: number, token: string, expiration: string): Promise<void> => {
    try {
      // SQL query to insert the token into the user_tokens table
      const query = `
        INSERT INTO user_tokens (user_id, token, expiration)
        VALUES ($1, $2, $3)
      `;
  
      // Execute the query with the provided parameters
      await pool.query(query, [user_id, token, expiration]);
  
      console.log('Token successfully inserted into user_tokens table');
    } catch (error) {
      console.error('Error inserting token into user_tokens table:', error);
      throw error; // Rethrow the error to handle it in the calling function
    }
  };
  
  

  
export const canUserAccessPackageQuery  = async (userId: number, packageId: number): Promise<boolean> => {
    const query = `
      SELECT 
        CASE
          WHEN p.group_id IS NULL THEN true
          WHEN p.group_id = ugm.group_id THEN true
          ELSE false
        END AS has_access
      FROM 
        package p
      LEFT JOIN 
        user_group_membership ugm
      ON 
        ugm.user_id = $1
      WHERE 
        p.id = $2
    `;
  
    try {
      const result = await pool.query(query, [userId, packageId]);
      if (result.rows.length > 0) {
        return result.rows[0].has_access;
      }
      return false; // Package not found or user doesn't have access
    } catch (error) {
      console.error(`Error checking access for user ${userId} to package ${packageId}:`, error);
      log(`Error checking access for user ${userId} to package ${packageId}: ${error}`)
      return false
    }
  };
  
  
  export const updateUserAccessQuery =async (can_download:boolean,can_search:boolean,can_upload:boolean,user_id:number)=>{
  
    const query = `
    UPDATE user_account
    SET 
      can_download = $1,
      can_search = $2,
      can_upload = $3
    WHERE id = $4
    RETURNING id, can_download, can_search, can_upload
  `;
  
  return await pool.query(query,[can_download,can_search,can_upload,user_id])
  }
  
  
  export const getUserAccessQuery =async (user_id:number)=>{
    const query=`
      SELECT can_download,can_search,can_upload from user_account WHERE  id= $1`
    
    return await pool.query(query,[user_id])
  }
  
  
  export const getUserWithUserNameQuery=async(client:PoolClient,userName:string)=>{


    const query=`SELECT * FROM user_account WHERE name = $1`

    return await client.query(query, [userName]);

  }

  export const insertUserToUsersQuery=async(client:PoolClient,name:string,password_hash:string,is_admin:boolean,can_download:boolean,can_search:boolean,can_upload:boolean)=>{


    const insertUserQuery = `
        INSERT INTO user_account (name, password_hash, is_admin,can_download,can_search,can_upload)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;

      return await client.query(insertUserQuery, [name, password_hash, is_admin || false,can_download,can_search,can_upload]);
  }


export const updateTokenQuery=async(token:string)=>{

  const updateQuery = `
  UPDATE user_tokens
  SET usage_count = usage_count + 1
  WHERE token = $1
  RETURNING usage_count
`;
  return await pool.query(updateQuery, [token]);

}


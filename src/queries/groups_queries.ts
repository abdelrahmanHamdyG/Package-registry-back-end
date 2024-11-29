import pool from '../db.js'; 

export const getUserGroupQuery = async (userId: number) => {
    const query = `
      SELECT group_id 
      FROM user_group_membership 
      WHERE user_id = $1
    `;
  
    try {
      const result = await pool.query(query, [userId]);
      return result
    } catch (error) {
      console.error(`Error fetching groups for user ID ${userId}:`, error);
      throw new Error('Failed to fetch user groups.');
    }
  };
  

  export const getAllGroupsQuery=async()=>{


    const getAllGroups=`
    SELECT * FROM user_groups
    `
    return await pool.query(getAllGroups)
  
  
  
  }
  
  
export const getUsersByGroupQuery = async (groupId: number) => {
    const query = `
      SELECT ua.id, ua.name, ua.is_admin, ua.can_download, ua.can_search, ua.can_upload
      FROM user_account ua
      INNER JOIN user_group_membership ugm ON ua.id = ugm.user_id
      WHERE ugm.group_id = $1
    `;
    return pool.query(query, [groupId]);
  };
  

  export const assignPackageGroupQuery=async (package_id:number,group_id:number)=>{


    const updatePackageGroupQuery = `
    UPDATE package
    SET group_id = $1
    WHERE id = $2
  `;
  
  return await pool.query(updatePackageGroupQuery,[group_id,package_id])
  
  
  }
  
  

export const checkGroupExistsQuery=async (group_id:number)=>{

    const groupCheckQuery = `
    SELECT * FROM user_groups
    WHERE id = $1
  `;
  
  return await pool.query(groupCheckQuery,[group_id])
  
  }


  
export const updateUserGroupQuery=async(user_id:number,group_id:number)=>{

    const updatePackageGroupQuery = `
    UPDATE user_group_membership
    SET group_id = $1
    WHERE user_id = $2
  `;

  return await pool.query(updatePackageGroupQuery,[group_id,user_id])

}



export const doesGroupExistQuery = async (groupId: number): Promise<boolean> => {
    const query = `
      SELECT 1 FROM user_groups
      WHERE id = $1
    `;
    const result = await pool.query(query, [groupId]);
    return result.rows.length > 0;
  };

  
  
export const isUserAlreadyInGroupQuery = async (
    userId: number,
  
  ): Promise<boolean> => {
    const query = `
      SELECT 1 FROM user_group_membership
      WHERE user_id = $1 
    `;
    const result = await pool.query(query, [userId]);
    return result.rows.length > 0;
  };
  
  
  
  export const insertUserToGroupQuery = async (userId: number, groupId: number) => {
    const query = `
      INSERT INTO user_group_membership (user_id, group_id)
      VALUES ($1, $2)
    `;
    await pool.query(query, [userId, groupId]);
  };
  

  export const insertToGroupsQuery=async(name:string)=>{

    console.log(`name is ${name}`)
    const query =`INSERT INTO user_groups (group_name)
        VALUES ($1) RETURNING *`
  
    return  pool.query(query,[name])
  
  }

  
  
export const getAllGroupsWithNameQuery=async (name:string)=>{

    const query=`SELECT * FROM user_groups WHERE group_name=$1`
  
    return  pool.query(query,[name])
  
  }
  
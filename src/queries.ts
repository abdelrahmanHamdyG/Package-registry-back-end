// queries.ts
import { Client, Pool, PoolClient } from 'pg';
import pool from './db.js'; // Adjust the path according to your project structure
import { userInfo } from 'os';


// Get package by ID
export const getPackageByIDQuery = (client:PoolClient, packageID: number) => {
  const query = `
    SELECT 
    p.id,
    p.name,
    p.version,
    p.group_id,
    pd.debloat,
    pd.js_program,
    pd.url
FROM 
    package p
JOIN 
    package_data pd
ON 
    p.id = pd.package_id
WHERE 
    p.id = $1;

  `;
  return client.query(query, [packageID]);
};

export const getUserGroup = async (userId: number) => {
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


// Get package by Name
// export const getPackageByNameQuery = (packageName: string) => {
//   const query = `
//     SELECT
//       p.p_id,
//       p.name,
//       p.github_url,
//       pv.version,
//       pv.correctness,
//       pv.responsiveness,
//       pv.ramp_up,
//       pv.bus_factor,
//       pv.license_metric
//     FROM
//       package p
//     LEFT JOIN
//       pack_version pv ON p.p_id = pv.p_id
//     WHERE
//       p.name = $1
//   `;
//   return pool.query(query, [packageName]);
// };

// Update package by ID
// export const updatePackageByIDQuery = (
//   packageID: string,
//   github_url: string
// ) => {
//   const query = `
//     UPDATE package
//     SET github_url = $1
//     WHERE p_id = $2
//     RETURNING *
//   `;
//   return pool.query(query, [ github_url, packageID]);
// };

// Update package version metrics
// export const updatePackageVersionMetricsQuery = (
//   packageID: string,
//   version: string,
//   correctness: number,
//   responsiveness: number,
//   ramp_up: number,
//   bus_factor: number,
//   license_metric: number
// ) => {
//   const query = `
//     UPDATE pack_version
//     SET correctness = $1, responsiveness = $2, ramp_up = $3, bus_factor = $4, license_metric = $5
//     WHERE p_id = $6 AND version = $7
//     RETURNING *
//   `;
//   return pool.query(query, [
//     correctness,
//     responsiveness,
//     ramp_up,
//     bus_factor,
//     license_metric,
//     packageID,
//     version,
//   ]);
// };

// // Delete package versions by package ID
// export const deletePackageVersionsByPackageIDQuery = (
//   client: PoolClient,
//   packageID: string
// ) => {
//   return client.query('DELETE FROM pack_version WHERE p_id = $1', [packageID]);
// };

// Delete package by ID
// export const deletePackageByIDQuery = (
//   client: PoolClient,
//   packageID: string
// ) => {
//   return client.query('DELETE FROM package WHERE p_id = $1 RETURNING *', [
//     packageID,
//   ]);
// };

// Insert new package
export const insertPackageQuery = (
  client: PoolClient,
  name: string,
  version: string
) => {
  const query = `
    INSERT INTO package (name, version)
    VALUES ($1, $2)
    RETURNING *
  `;
  return client.query(query, [name, version]);
};

export const getLatestPackage = (client:PoolClient, packageID: number) => {
  const query = `
  SELECT 
    p.version,
    pd.url
FROM 
    package p
JOIN 
    package_data pd ON pd.package_id = p.id
WHERE 
    p.name = (SELECT name FROM package WHERE id = $1)
ORDER BY 
    p.version DESC
LIMIT 1;

`;

  return client.query(query, [packageID]);
};

export const canIRead=async (user_id:number)=>{

  const userQuery = `
  SELECT can_download 
  FROM user_account 
  WHERE id = $1
`;

return await pool.query(userQuery,[user_id])
}

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


export const removeUserToken = async (token: string) => {
  const query = `DELETE FROM user_tokens WHERE token = $1`;
  return pool.query(query, [token]);
};

export const  checkIfTokenExists=async(token:string)=>{

  const query = `SELECT * FROM user_tokens WHERE token = $1`;
  return pool.query(query, [token]);

} 




export const assign_package_group=async (package_id:number,group_id:number)=>{


  const updatePackageGroupQuery = `
  UPDATE package
  SET group_id = $1
  WHERE id = $2
`;

return await pool.query(updatePackageGroupQuery,[group_id,package_id])


}

export const checkPackageExists=async (package_id:number)=>{

  const packageCheckQuery = `
  SELECT * FROM package
  WHERE id = $1
`;

return await pool.query(packageCheckQuery,[package_id])

}

export const checkGroupExists=async (group_id:number)=>{

  const groupCheckQuery = `
  SELECT * FROM user_groups
  WHERE id = $1
`;

return await pool.query(groupCheckQuery,[group_id])

}



export const canISearch=async (user_id:number)=>{

  const userQuery = `
  SELECT can_search 
  FROM user_account 
  WHERE id = $1
`;

return await pool.query(userQuery,[user_id])

}


export const canIUpload=async (user_id:number)=>{

  const userQuery = `
  SELECT can_upload 
  FROM user_account 
  WHERE id = $1
`;

return await pool.query(userQuery,[user_id])

}


export const getNameVersionById = (client:PoolClient, packageID: number) => {
  const query = `
    SELECT 
    p.name
FROM 
    package p
WHERE 
    p.id = $1;

  `;
  return client.query(query, [packageID]);
};
// Insert package version
export const insertIntoPackageData = (
  client: PoolClient,
  package_id: number,
  content:string,
  url:string,
  debloat:Boolean,
  js_program:string
) => {
  const query = `
    INSERT INTO package_data (package_id, content, url, debloat, js_program)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  return client.query(query, [
    package_id,
    content,
    url,
    debloat,
    js_program,
  ]);
};

// ------------------------------------------------------------------------------------
// New Queries for Additional Endpoints
// ------------------------------------------------------------------------------------

// Search packages based on query
// export const searchPackagesQuery = (packageQueries: any[], offset: number) => {
//     // Check if the request is for enumerating all packages (name == "*")
//     const isAllPackagesQuery = packageQueries.length === 1 && packageQueries[0].Name === "*";
  
//     const packageNames = packageQueries.map(query => query.Name);
//     const packageVersions = packageQueries.map(query => query.Version);
  
//     let query;
//     let queryParams;
  
//     if (isAllPackagesQuery) {
//       // If the query is for all packages, don't filter by name or version
//       query = `
//         SELECT
//           p.p_id,
//           p.name,
//           p.github_url,
//           pv.version,
//           pv.correctness,
//           pv.responsiveness,
//           pv.ramp_up,
//           pv.bus_factor,
//           pv.license_metric
//         FROM
//           package p
//         LEFT JOIN
//           pack_version pv ON p.p_id = pv.p_id
//         OFFSET $1
//       `;
//       queryParams = [offset];
//     } else {
//       // If it's not a "*" query, use name and version filters
//       query = `
//         SELECT
//           p.p_id,
//           p.name,
//           p.github_url,
//           pv.version,
//           pv.correctness,
//           pv.responsiveness,
//           pv.ramp_up,
//           pv.bus_factor,
//           pv.license_metric
//         FROM
//           package p
//         LEFT JOIN
//           pack_version pv ON p.p_id = pv.p_id
//         WHERE p.name = ANY($1::text[])
//         AND pv.version = ANY($2::text[])
//         OFFSET $3
//       `;
//       queryParams = [packageNames, packageVersions, offset];
//     }
  
//     return pool.query(query, queryParams);
//   };
  
  

  export const resetRegistryQuery = (client:PoolClient) => {
    const query = `
      TRUNCATE package CASCADE;
    `;
    return client.query(query);
  };

// Get package rating by package ID
export const getPackageRatingQuery = (packageID: number) => {
    //net score to be edited 
    const query = `
    SELECT * 
    FROM package_rating 
    WHERE package_id = $1;
`;


  return pool.query(query, [packageID]);
};

export const getAllUsersWithName=(name:string)=>{

  const query=`SELECT * from user_account WHERE name= $1`
  return pool.query(query,[name])

}

export const updateUserGroup=async(user_id:number,group_id:number)=>{

    const updatePackageGroupQuery = `
    UPDATE user_group_membership
    SET group_id = $1
    WHERE user_id = $2
  `;

  return await pool.query(updatePackageGroupQuery,[group_id,user_id])

}


export const doesGroupExist = async (groupId: number): Promise<boolean> => {
  const query = `
    SELECT 1 FROM user_groups
    WHERE id = $1
  `;
  const result = await pool.query(query, [groupId]);
  return result.rows.length > 0;
};

export const doesUserExist = async (userId: number): Promise<boolean> => {
  const query = `
    SELECT 1 FROM user_account
    WHERE id = $1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.length > 0;
};

export const isUserAlreadyInGroup = async (
  userId: number,

): Promise<boolean> => {
  const query = `
    SELECT 1 FROM user_group_membership
    WHERE user_id = $1 
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.length > 0;
};



export const insertUserToGroup = async (userId: number, groupId: number) => {
  const query = `
    INSERT INTO user_group_membership (user_id, group_id)
    VALUES ($1, $2)
  `;
  await pool.query(query, [userId, groupId]);
};


export const insertToUserToken = async (user_id: number, token: string, expiration: string): Promise<void> => {
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

export const insertToGroups=async(name:string)=>{

  console.log(`name is ${name}`)
  const query =`INSERT INTO user_groups (group_name)
      VALUES ($1) RETURNING *`

  return  pool.query(query,[name])

}


export const getAllGroupsWithName=async (name:string)=>{

  const query=`SELECT * FROM user_groups WHERE group_name=$1`

  return  pool.query(query,[name])



}

// Search packages by regular expression
export const searchPackagesByRegExQuery = (client:PoolClient,regex: string,group_id:number) => {
  const query = `
    SELECT id, name, version
    FROM package
    WHERE name ~* $1
      AND (
        group_id IS NULL
        OR group_id = $2
      )
  `
  return client.query(query, [regex,group_id]);
};

export const searchPackagesByRegExQueryForAdmin = (client:PoolClient,regex: string) => {
  const query = `
    SELECT id, name, version
    FROM package
    WHERE name ~* $1
  `
  return client.query(query, [regex]);
};

export const canUserAccessPackage = async (userId: number, packageId: number): Promise<boolean> => {
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
    throw new Error('Failed to check package access.');
  }
};


export const insertPackageRating = (
  client:PoolClient,
  packageID: number,
  correctness: number = -1,
  responsiveness: number = -1,
  ramp_up: number = -1,
  bus_factor: number = -1,
  license_metric: number = -1,
  pinning: number = -1,
  pull_request: number = -1,
  correctness_latency: number = -1,
  responsiveness_latency: number = -1,
  ramp_up_latency: number = -1,
  bus_factor_latency: number = -1,
  license_metric_latency: number = -1,
  pinning_latency: number = -1,
  pull_request_latency: number = -1,
  net_score: number = -1,
  net_score_latency: number = -1
) => {
  const query = `
    INSERT INTO package_rating (
      package_id, bus_factor, correctness, ramp_up, responsive_maintainer, license_score, 
      good_pinning_practice, pull_request, net_score, bus_factor_latency, 
      correctness_latency, ramp_up_latency, responsive_maintainer_latency, 
      license_score_latency, good_pinning_practice_latency, pull_request_latency, 
      net_score_latency
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 
      $7, $8, $9, $10, 
      $11, $12, $13, 
      $14, $15, $16, 
      $17
    )
  `;

  const values = [
    packageID, bus_factor, correctness, ramp_up, responsiveness, license_metric, 
    pinning, pull_request, net_score, bus_factor_latency, 
    correctness_latency, ramp_up_latency, responsiveness_latency, 
    license_metric_latency, pinning_latency, pull_request_latency, 
    net_score_latency
  ];

  return client.query(query, values);
};



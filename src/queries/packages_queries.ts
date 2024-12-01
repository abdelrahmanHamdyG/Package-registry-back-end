// queries.ts
import { Client, Pool, PoolClient } from 'pg';
import pool from '../db.js'; 
import { get_current_date } from '../controllers/utility_controller.js';


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

export const getLatestPackageQuery = (client:PoolClient, packageID: number) => {
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
export const checkPackageExistsQuery=async (package_id:number)=>{

  const packageCheckQuery = `
  SELECT * FROM package
  WHERE id = $1
`;

return await pool.query(packageCheckQuery,[package_id])

}

export const getPackageHistoryQuery=async (package_id:number)=>{

  const query=`

  SELECT * from package_history where package_id=$1

  `
  return await pool.query(query,[package_id])

}


export const getNameVersionByIdQuery = (client:PoolClient, packageID: number) => {
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


export const insertIntoPackageDataQuery = (
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


  export const resetRegistryQuery = async() => {
    const query = `
      TRUNCATE package CASCADE;
    `;
    return await pool.query(query);
  };

export const getPackageRatingQuery = (packageID: number) => {
    //net score to be edited 
    const query = `
    SELECT * 
    FROM package_rating 
    WHERE package_id = $1;
`;


  return pool.query(query, [packageID]);
};



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

export const searchPackagesByRegExQueryForAdminQuery  = (client:PoolClient,regex: string) => {
  const query = `
    SELECT id, name, version
    FROM package
    WHERE name ~* $1
  `
  return client.query(query, [regex]);
};
export const insertPackageRatingQuery  = (
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



export const insertToPackageHistoryQuery =async(user_id:number,action:string,package_id:number,client:PoolClient)=>{

  const current_date=get_current_date()

  const query=`
  INSERT INTO package_history 
  (package_id,user_id,action,action_date)
  VALUES ($1,$2,$3,$4)
  `

  if(client)
    return await client.query(query,[package_id,user_id,action,current_date])
  else
    return await pool.query(query,[package_id,user_id,action,current_date])
}


export const insertToPackageHistoryRatingQuery =async(user_id:number,action:string,package_id:number)=>{

  const current_date=get_current_date()

  const query=`
  INSERT INTO package_history 
  (package_id,user_id,action,action_date)
  VALUES ($1,$2,$3,$4)
  `

  return await pool.query(query,[package_id,user_id,action,current_date])


}



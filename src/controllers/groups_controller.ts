import e, { Request, Response } from 'express';

import { checkIfIamAdmin } from './utility_controller.js';
import { assignPackageGroupQuery, checkGroupExistsQuery, doesGroupExistQuery, getAllGroupsQuery, getAllGroupsWithNameQuery, getUsersByGroupQuery, insertToGroupsQuery, insertUserToGroupQuery, isUserAlreadyInGroupQuery, updateUserGroupQuery } from '../queries/groups_queries.js';
import { doesUserExistQuery } from '../queries/users_queries.js';
import { checkPackageExistsQuery } from '../queries/packages_queries.js';

export const createGroup=async(req:Request,res:Response)=>{

    const {name}=req.body;
  
    if(!name){
      res.status(401).json({error:"missing name"})
      return
    }

    const isAdmin=await checkIfIamAdmin(req)
    if(isAdmin==-1){
      res.status(402).json("token is missing or expired")
      return 
    }

    if(isAdmin==0){
      res.status(403).json({error:"you are not admin"})
      return
    }

  
    const results=await getAllGroupsWithNameQuery(name)
  
    if(results.rows.length>0){
      res.status(400).json({error:"this group  already exists"})
      console.error(`group with name ${name} already exists`)
      return 
    }
  
    try{
      const group=await insertToGroupsQuery(name)
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
        res.status(401).json({ error: 'Unauthorized: Token missing. or expired' });
        return
      }

      if (isAdmin!=1) {
          res.status(403).json({ error: 'Only admins can assign users to group.' });
          console.error(`you are not an admin`)
          return
      }

      const groupExists = await doesGroupExistQuery(groupId);
      if (!groupExists) {
        
         res.status(404).json({ error: "Group does not exist" });
         console.error(`group with id ${groupId} doesn't exists`)
         return
      }
  
      // Check if the user exists
      const userExists = await doesUserExistQuery(user_id);
      if (!userExists) {
        res.status(404).json({ error: "User does not exist" });
        return 
      }
  
      
      const isUserInGroup = await isUserAlreadyInGroupQuery(user_id);
      if (isUserInGroup) {
  
         await updateUserGroupQuery(user_id,groupId)
         res.status(409).json({ message: `User assigned to a new group ${groupId}`});
         console.log(`User ${user_id} assigned to a new group ${groupId}`)
         return
      }
      
      await insertUserToGroupQuery(user_id, groupId);
  
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

      res.status(401).json({ error: "Token missing or invalid or expired" });
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
      res.status(401).json({ error: "Token missing or invalid or expired" });
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
  
  
  

export const assignPackageToGroup=async(req:Request,res:Response)=>{

    const groupId=req.params.groupid as unknown as number
    const {package_id}=req.body



    try{

      const isAdmin=await checkIfIamAdmin(req)
      
      
      if (isAdmin==-1) {
        res.status(401).json({ error: 'Unauthorized: Token missing or expired' });
        return
      }

      
      if (isAdmin!=1 ) {
          res.status(403).json({ error: 'Only admins can assign packages to group.' });
          console.error(`you are not an admin`)
          return
      }

      const checkGroupExistsFlag=await checkGroupExistsQuery(groupId)
      const checkPackageExistsFlag=await checkPackageExistsQuery(package_id)
      if(!checkGroupExistsFlag.rows.length||!checkPackageExistsFlag.rows.length){

          res.status(400).json({"error":"either group or package doesn't exists"})
          console.log(`either group ${groupId} or package ${package_id} doesn't exists`)
          return 

      }

      await assignPackageGroupQuery(package_id,groupId)
      res.status(200).json({ message: "Package successfully assigned to group" });
      console.log(`Package ${package_id} successfully assigned to ${groupId}`)
      return 


    }catch(err){

      console.error("Error assigning package to group:", err);
      res.status(500).json({ error: "Internal server error" });
      return 
  
    } 



}
  
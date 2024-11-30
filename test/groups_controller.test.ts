import { describe, it, expect } from 'vitest';
import { Request, Response } from 'express';
import {vi} from 'vitest'
import {assignUserToGroup, createGroup, getAllGroups, getUsersByGroup,assignPackageToGroup} from '../src/controllers/groups_controller'
import { checkIfIamAdmin } from '../src/controllers/utility_controller';
import { insertToGroupsQuery,getAllGroupsWithNameQuery,isUserAlreadyInGroupQuery,doesGroupExistQuery,updateUserGroupQuery,insertUserToGroupQuery, getAllGroupsQuery,getUserGroupQuery, getUsersByGroupQuery,assignPackageGroupQuery,checkGroupExistsQuery} from '../src/queries/groups_queries';
import { doesUserExistQuery } from '../src/queries/users_queries';
import { checkPackageExistsQuery } from '../src/queries/packages_queries';


vi.mock('../src/controllers/utility_controller', () => ({
    checkIfIamAdmin: vi.fn(),
  }));
  
vi.mock('../src/queries/groups_queries', () => ({
    insertToGroupsQuery: vi.fn(),
    getAllGroupsWithNameQuery:vi.fn(),
    getAllGroupsQuery:vi.fn(),
    doesGroupExistQuery:vi.fn(),
    isUserAlreadyInGroupQuery:vi.fn(),
    updateUserGroupQuery:vi.fn(),
    insertUserToGroupQuery:vi.fn(),
    getUsersByGroupQuery:vi.fn(),
    assignPackageGroupQuery:vi.fn(),
    checkGroupExistsQuery:vi.fn()

  }));

vi.mock('../src/queries/users_queries',()=>({

    doesUserExistQuery:vi.fn(),


}));

vi.mock('../src/queries/packages_queries',()=>({

    checkPackageExistsQuery:vi.fn(),


}));






describe("createGroup",()=>{

    it('Should create group successfully 202',async()=>{


        // mocking request and response
        const req = { body: { name: 'test-group' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1); 
        (getAllGroupsWithNameQuery as vi.Mock).mockResolvedValue({ rows:[]}); 
        (insertToGroupsQuery as vi.Mock).mockResolvedValue({ rows: [{ id:555}] }); 
    
        await createGroup(req,res)

        expect(res.status).toHaveBeenCalledWith(202);
        expect(res.json).toHaveBeenCalledWith({ id: 555 });
    });



    it('should return 400 if the group already exists', async () => {
        const req = { body: { name: 'existing-group' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1); // Simulate admin user
        (getAllGroupsWithNameQuery as vi.Mock).mockResolvedValue({ rows: [{ id: 1 }] }); // Simulate group already exists
    
        await createGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'this group  already exists' });
      });
      
    it('should return 401 if "name" is missing', async () => {
        const req = { body: {} } as unknown as Request; // No name in body
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        await createGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'missing name' });
      });
      

      it('should return 402 if token is missing or expired', async () => {
        const req = { body: { name: 'test-group' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(-1); // Simulate token missing/expired
    
        await createGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(402);
        expect(res.json).toHaveBeenCalledWith('token is missing or expired');
      });

      it('should return 403 if the user is not admin', async () => {
        const req = { body: { name: 'test-group' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(0); // Simulate non-admin user
    
        await createGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'you are not admin' });
      });
    

    it('should return 500 if there is a database error', async () => {
        const req = { body: { name: 'new-group' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1); // Simulate admin user
        (getAllGroupsWithNameQuery as vi.Mock).mockResolvedValue({ rows: [] }); // Simulate group does not exist
        (insertToGroupsQuery as vi.Mock).mockRejectedValue(new Error('Database error')); // Simulate DB error
    
        await createGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'internal server error' });
      });
    

});

describe("assignUserToGroup",()=>{


    it("it should return 201 if the user assigned succesfully",async ()=>{
        const req = { params: { groupid: '1' }, body: { user_id: 123 } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;


        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(1);
        (doesGroupExistQuery as vi.Mock).mockResolvedValueOnce(true);
        (doesUserExistQuery as vi.Mock).mockResolvedValue(true);
        (isUserAlreadyInGroupQuery as vi.Mock).mockResolvedValue(false); 
        (insertUserToGroupQuery as vi.Mock).mockResolvedValue(null); 

        await assignUserToGroup(req,res)
        expect(res.status).toHaveBeenCalledWith(201)
        expect(insertUserToGroupQuery).toHaveBeenCalledWith(123,1)

    })

    it('it should  return 202 update the user group if the user is already in a group and update successfully', async () => {
        const req = {
          params: { groupid: '1' },
          body: { user_id: 2 },
        } as unknown as Request;
    
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1); // Admin user
        (doesGroupExistQuery as vi.Mock).mockResolvedValue(true); // Group exists
        (doesUserExistQuery as vi.Mock).mockResolvedValue(true); // User exists
        (isUserAlreadyInGroupQuery as vi.Mock).mockResolvedValue(true); // User already in a group
        (updateUserGroupQuery as vi.Mock).mockResolvedValue(null); // Updated successfully
    
        await assignUserToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(202);
        expect(res.json).toHaveBeenCalledWith({ message: `User assigned to a new group 1` });
      });
    

    it('should return 400 if group ID or user ID is missing', async () => {
        const req = {
          params: { groupid: '3' },
          body: { user_id: null },
        } as unknown as Request;
    
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
    
        await assignUserToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Missing group ID or user ID" });
      });
    
    it('should return 401 if the token is missing or expired', async () => {
        const req = {
          params: { groupid: '1' },
          body: { user_id: 2 },
        } as unknown as Request;
    
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(-1); // Token missing or expired
    
        await assignUserToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Token missing or expired' });
      });
    
    it('should return 403 if the user is not an admin', async () => {
        const req = {
          params: { groupid: '1' },
          body: { user_id: 2 },
        } as unknown as Request;
    
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(0); // Not an admin
    
        await assignUserToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Only admins can assign users to group.' });
      });
    
    it('should return 404 if the group does not exist', async () => {
        const req = {
          params: { groupid: '1' },
          body: { user_id: 2 },
        } as unknown as Request;
    
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1); // Admin user
        (doesGroupExistQuery as vi.Mock).mockResolvedValue(false); // Group does not exist
    
        await assignUserToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Group does not exist" });
      });
    
    it('should return 404 if the user does not exist', async () => {
        const req = {
          params: { groupid: '1' },
          body: { user_id: 2 },
        } as unknown as Request;
    
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1); // Admin user
        (doesGroupExistQuery as vi.Mock).mockResolvedValue(true); // Group exists
        (doesUserExistQuery as vi.Mock).mockResolvedValue(false); // User does not exist
    
        await assignUserToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "User does not exist" });
      });
    
    it('should return 500 if there is a database error', async () => {
        const req = {
            params: { groupid: '1' },
            body: { user_id: 2 },
          } as unknown as Request;
      
          const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
          } as unknown as Response;
      

        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(1);
        (doesGroupExistQuery as vi.Mock).mockResolvedValueOnce(true);
        (doesUserExistQuery as vi.Mock).mockResolvedValue(true);
        (isUserAlreadyInGroupQuery as vi.Mock).mockRejectedValue(new Error('Database error')); 
        (insertUserToGroupQuery as vi.Mock).mockResolvedValue(null); 

        
    
        await assignUserToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    

})


describe("getAllGroups",async()=>{


    it("should get all groups and return 200",async()=>{
        const req = {  body: { } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1); 
        (getAllGroupsQuery as vi.Mock).mockResolvedValue({ rows: [{name:"group1",id:6},{name:"group2",id:7}]})
        await getAllGroups(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([{name:"group1",id:6},{name:"group2",id:7}]);
    
    })

    it("should return 401 if the token is missing, invalid, or expired", async () => {
        const req = {} as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(-1); // Simulate token missing/invalid/expired
    
        await getAllGroups(req, res);
    
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Token missing or invalid or expired" });
      });
    it("should return 403 if the user is not an admin", async () => {
        const req = {} as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(0); // Simulate user is not an admin
    
        await getAllGroups(req, res);
    
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: Only admins can view all groups" });
      });
    
    
    it("should return 500 if there is an internal server error", async () => {
        const req = {} as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(1); // Simulate admin user
        (getAllGroupsQuery as vi.Mock).mockRejectedValueOnce(new Error("Database error")); // Simulate query failure
    
        await getAllGroups(req, res);
    
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
      });
    
    
})


describe("getUsersByGroups",async()=>{

    it("should return 202 and the users if the user is an admin", async () => {
        const req = { params: { groupid: "1" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        const mockUsers = [{ id: 1, name: "Abdelrahman" }, { id: 2, name: "User B" }];
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(1); 
        (getUsersByGroupQuery as vi.Mock).mockResolvedValueOnce({ rows: mockUsers }); 
        await getUsersByGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(202);
        expect(res.json).toHaveBeenCalledWith(mockUsers);
      });
    

    it("it should return 401 if token is missing, invalid, or expired", async () => {
        const req = { params: { groupid: "1" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(-1); // Simulate token missing/invalid/expired
    
        await getUsersByGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Token missing or invalid or expired" });
      });
    
    it("it should return 402 if group ID is missing or invalid", async () => {
        const req = { params: { groupid: undefined } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        await getUsersByGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(402);
        expect(res.json).toHaveBeenCalledWith({ error: "group id missing" });
      });
    
    it("should return 403 if the user is not an admin", async () => {
        const req = { params: { groupid: "1" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(0); // Simulate user is not an admin
    
        await getUsersByGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: Only admins can view users by groups" });
      });


    it("should return 500 if there is an internal server error", async () => {
        const req = { params: { groupid: "1" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(1); // Simulate admin user
        (getUsersByGroupQuery as vi.Mock).mockRejectedValueOnce(new Error("Database error")); // Simulate query failure
    
        await getUsersByGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: `internal server error Error: Database error` });
      });
      
})





describe("assignPackageToGroup",async()=>{


    it("should return 200 if package is successfully assigned to group", async () => {
        const req = { params: { groupid: "1" }, body: { package_id: "123" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(1); // User is an admin
        (checkGroupExistsQuery as vi.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Group exists
        (checkPackageExistsQuery as vi.Mock).mockResolvedValueOnce({ rows: [{ id: 123 }] }); // Package exists
        (assignPackageGroupQuery as vi.Mock).mockResolvedValueOnce(null); // Assign success
    
        await assignPackageToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Package successfully assigned to group" });
        expect(assignPackageGroupQuery).toHaveBeenCalledWith(123, 1); // Verify the query was called with correct arguments
      });
    
    it("should return 400 if group or package does not exist", async () => {
        const req = { params: { groupid: "1" }, body: { package_id: "123" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(1); // User is an admin
        (checkGroupExistsQuery as vi.Mock).mockResolvedValueOnce({ rows: [] }); // Group does not exist
        (checkPackageExistsQuery as vi.Mock).mockResolvedValueOnce({ rows: [] }); // Package does not exist
    
        await assignPackageToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "either group or package doesn't exists" });
      });
    
    it("should return 401 if token is missing or expired", async () => {
        const req = { params: { groupid: "1" }, body: { package_id: "123" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(-1); // Token missing or expired
    
        await assignPackageToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized: Token missing or expired" });
      });
    
    it("should return 403 if the user is not an admin", async () => {
        const req = { params: { groupid: "1" }, body: { package_id: "123" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        (checkIfIamAdmin as vi.Mock).mockResolvedValueOnce(0); // User is not an admin
    
        await assignPackageToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: "Only admins can assign packages to group." });
      });
    
    it("should return 405 if group ID or package ID is missing", async () => {
        const req = { params: { groupid: "" }, body: { package_id: "" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        await assignPackageToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith({ error: "missing group id or package id " });
      });

    it("should return 406 if group ID or package ID has the wrong format", async () => {
        const req = { params: { groupid: "abc" }, body: { package_id: "def" } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    
        await assignPackageToGroup(req, res);
    
        expect(res.status).toHaveBeenCalledWith(406);
        expect(res.json).toHaveBeenCalledWith({ error: "wrong format for group id or package id " });
      });
    
    


})
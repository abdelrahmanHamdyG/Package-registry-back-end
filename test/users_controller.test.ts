import { describe, it, expect } from 'vitest';
import { Request, Response } from 'express';
import { vi } from 'vitest';
import bcrypt from 'bcrypt';
import pool from '../src/db.js';
import jwt from 'jsonwebtoken';
import { checkIfIamAdmin } from '../src/controllers/utility_controller';
import { getUserWithUserNameQuery, insertUserToUsersQuery ,getAllUsersWithNameQuery,insertToUserTokenQuery,removeUserTokenQuery,getUserAccessQuery,updateUserAccessQuery} from '../src/queries/users_queries';
import { doesGroupExistQuery, insertUserToGroupQuery } from '../src/queries/groups_queries';
import { registerNewUser,authenticate,logout,getUserAccess,updateUserAccess } from '../src/controllers/users_controller';

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('../src/db.js', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    }),
  },
}));


vi.mock('jsonwebtoken', () => ({
    default: {
      sign: vi.fn(),
      verify: vi.fn(),
    },
  }));


vi.mock('../src/queries/users_queries', () => ({

  getUserWithUserNameQuery: vi.fn(),
  insertUserToUsersQuery: vi.fn(),
  getAllUsersWithNameQuery: vi.fn(),
  insertToUserTokenQuery:vi.fn(),
  removeUserTokenQuery: vi.fn(),
  getUserAccessQuery: vi.fn(),
  updateUserAccessQuery: vi.fn(),

}));

vi.mock('../src/queries/groups_queries', () => ({
  doesGroupExistQuery: vi.fn(),
  insertUserToGroupQuery: vi.fn(),
}));

vi.mock('../src/controllers/utility_controller', () => ({
  checkIfIamAdmin: vi.fn(),
}));


// to increase the coverage I may add uncomment the commented commented one 
describe('register', () => {

  it('should register a user successfully',async () => {

      const req = {
        body: { name: 'Abdelrahman', password: '12345679', isAdmin: false },
      } as unknown as Request;

      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

      
      (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
      (getUserWithUserNameQuery as vi.Mock).mockResolvedValue({ rows: [] });
      (bcrypt.hash as vi.Mock).mockResolvedValue('hashedpassword');
      (insertUserToUsersQuery as vi.Mock).mockResolvedValue({ rows: [{ id: 10 }] });

       //const mockClient = {query: vi.fn(),release: vi.fn(),};
      //(pool.connect as vi.Mock).mockResolvedValue(mockClient);
      
      
      await registerNewUser(req, res)
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'User registered successfully.' });
      //expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      //expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      //expect(mockClient.release).toHaveBeenCalled();

      
    }, 
  );

  it('should return 400 if name or password is missing', async () => {
    const req = { body: { password: '12345679' } } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  
    await registerNewUser(req, res);
  
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing name or password.' });
  });
  
  it('should return 401 if token is missing or expired', async () => {
    const req = { body: { name: 'Abdelrahman', password: '12345679' } } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(-1);
  
    await registerNewUser(req, res);
  
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Token missing. or expired ' });
  });

  it('should return 403 if the user is not an admin', async () => {
    const req = { body: { name: 'Abdelrahman', password: '12345679' } } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(0);
  
    await registerNewUser(req, res);
  
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Only admins can register users.' });
  });

  
  it('should return 409 if a user with the same name already exists', async () => {
    const req = { body: { name: 'Abdelrahman', password: '12345679' } } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (getUserWithUserNameQuery as vi.Mock).mockResolvedValue({ rows: [{ id: 1 }] });
  
    await registerNewUser(req, res);
  
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'User with this name already exists.' });
  });
  
  it('should return 409 if the provided group does not exist', async () => {
    const req = {
      body: { name: 'Abdelrahman', password: '12345679', groupId: 2 },
    } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (getUserWithUserNameQuery as vi.Mock).mockResolvedValue({ rows: [] });
    (bcrypt.hash as vi.Mock).mockResolvedValue('hashedpassword');
    (insertUserToUsersQuery as vi.Mock).mockResolvedValue({ rows: [{ id: 10 }] });
    (doesGroupExistQuery as vi.Mock).mockResolvedValue(false);
  
    await registerNewUser(req, res);
  
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "This group doesn't exist" });
  });
  
  it('should return 500 if there is an internal server error', async () => {
    const req = {
      body: { name: 'Abdelrahman', password: '12345679', isAdmin: false },
    } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (getUserWithUserNameQuery as vi.Mock).mockImplementation(() => {
      throw new Error('Database error');
    });
  
    await registerNewUser(req, res);
  
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error.' });
  });
  
});


describe("authenticate",()=>{


    it('should return 200 and a JWT token on successful authentication', async () => {
        const req = { body: { User: { name: 'testuser' }, Secret: { password: 'password123' } } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (getAllUsersWithNameQuery as vi.Mock).mockResolvedValue({
          rows: [{ id: 1, password_hash: 'hashedpassword', is_admin: true }],
        });
        (bcrypt.compare as vi.Mock).mockResolvedValue(true);
        (jwt.sign as vi.Mock).mockReturnValue('mocktoken');
        (insertToUserTokenQuery as vi.Mock).mockResolvedValue(null);
      
        await authenticate(req, res);
      
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ token: 'Bearer mocktoken' });
        expect(insertToUserTokenQuery).toHaveBeenCalledWith(1, 'mocktoken', expect.any(String));
      });
    

    it('should return 400 if required fields are missing', async () => {
        const req = { body: { User: {}, Secret: {} } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        await authenticate(req, res);
      
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: 'There is missing field(s) in the AuthenticationRequest or it is formed improperly.',
        });
      });
    

    it('should return 401 if the user is not found', async () => {
        const req = { body: { User: { name: 'testuser' }, Secret: { password: 'password123' } } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (getAllUsersWithNameQuery as vi.Mock).mockResolvedValue({ rows: [] });
      
        await authenticate(req, res);
      
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'The user or password is invalid.' });
      });
    

    it('should return 401 if the password is invalid', async () => {
        const req = { body: { User: { name: 'testuser' }, Secret: { password: 'wrongpassword' } } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (getAllUsersWithNameQuery as vi.Mock).mockResolvedValue({
          rows: [{ id: 1, password_hash: 'hashedpassword', is_admin: false }],
        });
        (bcrypt.compare as vi.Mock).mockResolvedValue(false);
      
        await authenticate(req, res);
      
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'The user or password is invalid.' });
      });
      
    it('should return 500 if there is an internal server error', async () => {
        const req = { body: { User: { name: 'testuser' }, Secret: { password: 'password123' } } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (getAllUsersWithNameQuery as vi.Mock).mockRejectedValue(new Error('Database error'));
      
        await authenticate(req, res);
      
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error.' });
      });
      

})


describe("logout",()=>{

    it('should return 200 on successful logout', async () => {
        const req = { headers: { authorization: 'Bearer validtoken' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 }); // Mock successful verification
        (removeUserTokenQuery as vi.Mock).mockResolvedValue(null);
      
        await logout(req, res);
      
        expect(jwt.verify).toHaveBeenCalledWith('validtoken', process.env.JWT_SECRET);
        expect(removeUserTokenQuery).toHaveBeenCalledWith('validtoken');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully.' });
      });


      
    it('should return 400 if token is missing', async () => {
        const req = { headers: {} } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        await logout(req, res);
      
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'Token is missing.' });
      });
    
    
    it('should return 500 if there is an error removing the token', async () => {
        const req = { headers: { authorization: 'Bearer validtoken' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 }); // Mock successful verification
        (removeUserTokenQuery as vi.Mock).mockRejectedValue(new Error('Database error'));
      
        await logout(req, res);
      
        expect(jwt.verify).toHaveBeenCalledWith('validtoken', process.env.JWT_SECRET);
        expect(removeUserTokenQuery).toHaveBeenCalledWith('validtoken');
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error.' });
      });
      
})



describe("getUserAccess",()=>{


    it('should return 202 and user access details if the user is found', async () => {
        const req = { params: { user_id: '1' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        const mockAccessData = [{ can_download: true, can_search: true, can_upload: false }];
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(true);
        (getUserAccessQuery as vi.Mock).mockResolvedValue({ rows: mockAccessData });
      
        await getUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(202);
        expect(res.json).toHaveBeenCalledWith(mockAccessData);
      });
      

    it('should return 400 if user ID is missing or invalid', async () => {
        const req = { params: { user_id: '' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        await getUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: 'User ID is required and must be a valid number.',
        });
      });
    
    it('should return 401 if token is missing or invalid', async () => {
        const req = { params: { user_id: '1' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(-1);
      
        await getUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Unauthorized: Token missing or invalid. or expired',
        });
      });
      
    it('should return 402 if the user is not found', async () => {
        const req = { params: { user_id: '1' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(true);
        (getUserAccessQuery as vi.Mock).mockResolvedValue({ rows: [] });
      
        await getUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(402);
        expect(res.json).toHaveBeenCalledWith({ error: 'User Not Found' });
      });
        
    it('should return 403 if the user is not an admin', async () => {
        const req = { params: { user_id: '1' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(false);
      
        await getUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Forbidden: Only admins can update user permissions.',
        });
      });
      
    it('should return 500 if there is an internal server error', async () => {
        const req = { params: { user_id: '1' } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(true);
        (getUserAccessQuery as vi.Mock).mockRejectedValue(new Error('Database error'));
      
        await getUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          message: 'Internal server error: Database error',
        });
    });
      

})


describe("updateUserAccess",()=>{


    
    it('should return 200 and update permissions successfully', async () => {
        const req = { params: { user_id: '1' }, body: { can_download: true, can_search: false, can_upload: true } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        const mockUpdatedUser = { id: 1, can_download: true, can_search: false, can_upload: true };
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(true);
        (updateUserAccessQuery as vi.Mock).mockResolvedValue({ rowCount: 1, rows: [mockUpdatedUser] });
      
        await updateUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
          message: 'User permissions updated successfully.',
          user: mockUpdatedUser,
        });
      });
      
      it('should return 400 if permission fields are invalid', async () => {
        const req = {
          params: { user_id: '1' },
          body: { can_download: 'true', can_search: null, can_upload: undefined },
        } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        await updateUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: 'At least one valid permission (can_download, can_search, can_upload) must be provided.',
        });
      });
      
      it('should return 400 if user ID is missing or invalid', async () => {
        const req = { params: { user_id: '' }, body: {} } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        await updateUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'User ID is required and must be a valid number.' });
      });

      it('should return 401 if token is missing or invalid', async () => {
        const req = { params: { user_id: '1' }, body: {} } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(-1);
      
        await updateUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Token missing or invalid or expired' });
      });


      it('should return 403 if the user is not an admin', async () => {
        const req = { params: { user_id: '1' }, body: {} } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(false);
      
        await updateUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: Only admins can update user permissions.' });
      });
      
      
      it('should return 404 if the user is not found', async () => {
        const req = { params: { user_id: '1' }, body: { can_download: true, can_search: false, can_upload: true } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(true);
        (updateUserAccessQuery as vi.Mock).mockResolvedValue({ rowCount: 0 });
      
        await updateUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'User not found.' });
      });

      
      it('should return 500 if there is an internal server error', async () => {
        const req = { params: { user_id: '1' }, body: { can_download: true, can_search: false, can_upload: true } } as unknown as Request;
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(true);
        (updateUserAccessQuery as vi.Mock).mockRejectedValue(new Error('Database error'));
      
        await updateUserAccess(req, res);
      
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error.' });
      });
      
})
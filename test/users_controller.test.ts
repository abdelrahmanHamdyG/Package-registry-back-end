import { describe, it, expect } from 'vitest';
import { Request, Response } from 'express';
import { vi } from 'vitest';

import bcrypt from 'bcrypt';
import pool from '../src/db.js';

import { checkIfIamAdmin } from '../src/controllers/utility_controller';
import { getUserWithUserNameQuery, insertUserToUsersQuery } from '../src/queries/users_queries';
import { doesGroupExistQuery, insertUserToGroupQuery } from '../src/queries/groups_queries';
import { registerNewUser } from '../src/controllers/users_controller';

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
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

vi.mock('../src/queries/users_queries', () => ({
  getUserWithUserNameQuery: vi.fn(),
  insertUserToUsersQuery: vi.fn(),
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

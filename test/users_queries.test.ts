import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import pool from '../src/db.js';
import { PoolClient } from 'pg'
import {
    canIReadQuery,removeUserTokenQuery,checkIfTokenExistsQuery,canISearchQuery,canIUploadQuery,getAllUsersWithNameQuery,doesUserExistQuery,insertToUserTokenQuery,canUserAccessPackageQuery, updateUserAccessQuery,getUserAccessQuery, getUserWithUserNameQuery, insertUserToUsersQuery,updateTokenQuery
  } from '../src/queries/users_queries';
// Mock the pg module entirely to prevent any real connections

vi.mock('../src/db.js', () => ({
    default: {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn(),
        release: vi.fn(),
      }),
      query:vi.fn() 
    },
  }));
  const normalizeQueryFlat = (query: string) =>
    query
      .split('\n')
      .map(line => line.trim())
      .join(' ') // Join with a space instead of '\n'.
      .replace(/\s+/g, ' ') // Ensure no extra spaces remain.
      .trim(); // Remove any leading or trailing spaces.
describe('Database Queries', () => {
        beforeEach(() => {
          vi.clearAllMocks();
        });
      
        afterEach(() => {
          vi.clearAllMocks();
        });
      
        it('return if the user cna read or not', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const user_id=1
            // Call the function
            await canIReadQuery(user_id);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('SELECT can_download'), [user_id]);
        });
        it('remove user token', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const token="test"
            // Call the function
            await removeUserTokenQuery(token);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM user_tokens'), [token]);
        });
        it('check the token', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const token="test"
            // Call the function
            await checkIfTokenExistsQuery(token);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM user_tokens'), [token]);
        });
        it('return if the user can search or not', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const user_id=1
            // Call the function
            await canISearchQuery(user_id);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('SELECT can_search'), [user_id]);
        });
        it('return if the user can upload or not', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const user_id=1
            // Call the function
            await canIUploadQuery(user_id);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('SELECT can_upload'), [user_id]);
        });
        it('get the users with name', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const name="test"
            // Call the function
            await getAllUsersWithNameQuery(name);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('SELECT * from user_account WHERE name= $1'), [name]);
        });
        it('check if the user exists', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const id=1
            // Call the function
            await doesUserExistQuery(id);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('SELECT 1 FROM user_account'), [id]);
        });
        it('insert token to a user', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const user_id= 1
            const token="token test"
            const expiration= "test"
            // Call the function
            await insertToUserTokenQuery(user_id,token,expiration);
        
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining(' INSERT INTO user_tokens (user_id, token, expiration)'), [user_id,token,expiration]);
        });
        it('insert token to a user', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const user_id= 1
            const package_id=2
            // Call the function
            await canUserAccessPackageQuery(user_id,package_id);
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining(' user_group_membership ugm'), [user_id,package_id]);
        });
        it('Update user group', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const test=true
            const id=1
            // Call the function
            await updateUserAccessQuery(test,test,test,id);
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining(' UPDATE user_account'), [test,test,test,id]);
        });
        it('get user access', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });

            const id=1
            // Call the function
            await getUserAccessQuery(id);
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining(' SELECT can_download,can_search,can_upload from user_account WHERE  id= $1'), [id]);
        });
        it('Updating token', async () => {
            (pool.query as vi.Mock).mockResolvedValueOnce({ rows: [] });
            const token="test"
            // Call the function
            await updateTokenQuery(token);
            // Verify that pool.query was called with the correct query
            expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_tokens'), [token]);
        });
        it('get user with name', async () => {
            let mockClient: vi.Mocked<PoolClient>;
            mockClient = {
                query: vi.fn(),  // Mock the query function
            } as unknown as vi.Mocked<PoolClient>;
            const user_name = 123;
            const packageIDArray = [user_name];
            await getUserWithUserNameQuery(mockClient,user_name);
            expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat('SELECT * FROM user_account WHERE name = $1'));
            expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
          });
          it('insert user to the users table', async () => {
            let mockClient: vi.Mocked<PoolClient>;
            mockClient = {
                query: vi.fn(),  // Mock the query function
            } as unknown as vi.Mocked<PoolClient>;
            const name="testing name"
            const password_hash="testing password"
            const booltest=true
            await insertUserToUsersQuery(mockClient,name,password_hash,booltest,booltest,booltest,booltest);
            expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
            INSERT INTO user_account (name, password_hash, is_admin,can_download,can_search,can_upload)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `));
            expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual([name,password_hash,booltest,booltest,booltest,booltest]);
          });



        
    })

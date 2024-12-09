import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import pool from '../src/db.js';
import { PoolClient } from 'pg'
import {
    getUserGroupQuery,
    getAllGroupsQuery,
    getUsersByGroupQuery,
    assignPackageGroupQuery,
    checkGroupExistsQuery,
    updateUserGroupQuery,
    doesGroupExistQuery,
    isUserAlreadyInGroupQuery,
    insertUserToGroupQuery,
    insertToGroupsQuery,
    getAllGroupsWithNameQuery

  } from '../src/queries/groups_queries';
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
  
    it('should fetch all users', async () => {
      const mockResult = { rows: [{ id: 1, name: 'John Doe' }] };
  
      // Mock the implementation of pool.query to return mockResult
      (pool.query as vi.Mock).mockResolvedValue(mockResult);
        const id=1
      const result = await getUserGroupQuery(id);
      expect(result).toEqual(mockResult);
    });

      
      it('getAllGroupsQuery should return all groups', async () => {
        const mockResult = { rows: [{ id: 1, name: 'Admins' }] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
        const result = await getAllGroupsQuery();
        expect(result).toEqual(mockResult);
      });
    
      it('getUsersByGroupQuery should return users in a group', async () => {
        const groupId = 5;
        const mockResult = { rows: [{ id: 100, name: 'User100', is_admin: false }] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
        const result = await getUsersByGroupQuery(groupId);
        expect(result).toEqual(mockResult);
      });
    
      it('assignPackageGroupQuery should update package group', async () => {
        const packageId = 10;
        const groupId = 2;
        const mockResult = { rows: [] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await assignPackageGroupQuery(packageId, groupId);
        expect(result).toEqual(mockResult);
      });
    
      it('checkGroupExistsQuery should return group info', async () => {
        const groupId = 2;
        const mockResult = { rows: [{ id: 2 }] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await checkGroupExistsQuery(groupId);
        expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('FROM user_groups'), [groupId]);
        expect(result).toEqual(mockResult);
      });
    
      it('updateUserGroupQuery should update user group membership', async () => {
        const userId = 50;
        const groupId = 5;
        const mockResult = { rowCount: 1 };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await updateUserGroupQuery(userId, groupId);
        expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_group_membership'), [groupId, userId]);
        expect(result).toEqual(mockResult);
      });
    
      it('doesGroupExistQuery should return true if group exists', async () => {
        const groupId = 99;
        const mockResult = { rows: [{ id: 99 }] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await doesGroupExistQuery(groupId);
        expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('FROM user_groups'), [groupId]);
        expect(result).toBe(true);
      });
    
      it('doesGroupExistQuery should return false if group does not exist', async () => {
        const groupId = 999;
        const mockResult = { rows: [] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await doesGroupExistQuery(groupId);
        expect(pool.query as vi.Mock).toHaveBeenCalledWith(expect.stringContaining('FROM user_groups'), [groupId]);
        expect(result).toBe(false);
      });
    
      it('isUserAlreadyInGroupQuery should return true if user is in a group', async () => {
        const userId = 123;
        const mockResult = { rows: [{ user_id: 123 }] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await isUserAlreadyInGroupQuery(userId);
        expect((pool.query as vi.Mock)).toHaveBeenCalledWith(expect.stringContaining('FROM user_group_membership'), [userId]);
        expect(result).toBe(true);
      });
    
      it('isUserAlreadyInGroupQuery should return false if user is not in a group', async () => {
        const userId = 1234;
        const mockResult = { rows: [] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await isUserAlreadyInGroupQuery(userId);
        expect((pool.query as vi.Mock)).toHaveBeenCalledWith(expect.stringContaining('FROM user_group_membership'), [userId]);
        expect(result).toBe(false);
      });
      it('getting all users names by a group name', async () => {
        const username = 'testing';
        const mockResult = { rows: [{ username: 'testing' }] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
        const result = await getAllGroupsWithNameQuery(username);
        expect((pool.query as vi.Mock)).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM user_groups'), [username]);
        expect(result).toEqual(mockResult);
      });
    
      it('isUserAlreadyInGroupQuery should return false if user is not in a group', async () => {
        const username = 'testing';
        const mockResult = { rows: [] };
        (pool.query as vi.Mock).mockResolvedValue(mockResult);
    
        const result = await insertToGroupsQuery(username);
        expect((pool.query as vi.Mock)).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_groups'), [username]);
        expect(result).toBe(mockResult);
      });
      it('getPackageRatingQuery should call pool.query with correct SQL and parameters', async () => {
        let mockClient: vi.Mocked<PoolClient>;
          mockClient = {
            query: vi.fn(),  // Mock the query function
          } as unknown as vi.Mocked<PoolClient>;
        const userId=1
        const packageID = 123;
        const packageIDArray = [userId,packageID];
        await insertUserToGroupQuery(userId,packageID,mockClient);
        expect(normalizeQueryFlat((mockClient.query as vi.Mock).mock.calls[0][0])).toBe(normalizeQueryFlat(`
        INSERT INTO user_group_membership (user_id, group_id)
        VALUES ($1, $2)
      `));
        expect((mockClient.query as vi.Mock).mock.calls[0][1]).toEqual(packageIDArray);
      });

      
  });
  
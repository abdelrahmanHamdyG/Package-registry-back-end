import { describe, it, expect,beforeEach,afterEach } from 'vitest';
import { query, Request, Response } from 'express';
import { vi } from 'vitest';
import bcrypt from 'bcrypt';
import pool from '../src/db.js';
import jwt from 'jsonwebtoken';
import { checkIfIamAdmin} from '../src/controllers/utility_controller';
import { isValidIdFormat } from '../src/controllers/utility_controller';
import {canISearchQuery,canIReadQuery,canIUploadQuery,canUserAccessPackageQuery} from '../src/queries/users_queries';
import {getUserGroupQuery} from '../src/queries/groups_queries'
import {searchPackagesByQueries,resetRegistry,getPackageByID,searchPackageByRegex,getPackageHistory,getPackageRating} from '../src/controllers/packages_controller'
import { resetRegistryQuery,getPackageByIDQuery,insertToPackageHistoryQuery,searchPackagesByRegExQuery,searchPackagesByRegExQueryForAdminQuery,getPackageHistoryQuery,getPackageRatingQuery, checkPackageExistsQuery,insertToPackageHistoryRatingQuery} from '../src/queries/packages_queries.js';
import { downloadFromS3 } from '../src/s3.js';



vi.mock('jsonwebtoken', () => ({
    default: {
      sign: vi.fn(),
      verify: vi.fn(),
    },
  }));


vi.mock('../src/s3.js',()=>({

    downloadFromS3:vi.fn()

}));
vi.mock('../src/db.js', () => ({
    default: {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn(),
        release: vi.fn(),
      }),
      query:vi.fn()
    },
  }));

vi.mock('../src/controllers/utility_controller', () => ({
checkIfIamAdmin: vi.fn(),
}));

vi.mock('../src/queries/groups_queries', () => ({
getUserGroupQuery: vi.fn(),

}));

vi.mock('../src/queries/users_queries', () => ({
canIReadQuery: vi.fn(),
canISearchQuery: vi.fn(),
canIUploadQuery: vi.fn(),
canUserAccessPackageQuery:vi.fn()
}));

vi.mock('../src/queries/packages_queries',()=>({

resetRegistryQuery:vi.fn(),
getPackageByIDQuery:vi.fn(),
insertToPackageHistoryQuery:vi.fn(),
searchPackagesByRegExQuery:vi.fn(),
searchPackagesByRegExQueryForAdminQuery:vi.fn(),
getPackageHistoryQuery:vi.fn(),
getPackageRatingQuery:vi.fn(),
checkPackageExistsQuery:vi.fn(),
insertToPackageHistoryRatingQuery:vi.fn()
}));




describe('searchPackagesByQueries', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: [
        { Name: 'package1', Version: '^1.0.0' },
        { Name: 'package2', Version: '~2.3.0' },
      ],
      query: { offset: '0' },
      headers: { 'x-authorization': 'Bearer token' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 with packages if user is allowed to search', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(false);
    (canISearchQuery as vi.Mock).mockResolvedValue({ rows: [{ can_search: true }] });
    (getUserGroupQuery as vi.Mock).mockResolvedValue({ rows: [{ group_id: 123 }] });
    (pool.query as vi.Mock).mockResolvedValue({
      rows: [{ id: 1, name: 'package1', version: '1.0.0' }],
    });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ ID: '1', Name: 'package1', Version: '1.0.0' }]);
    expect(res.setHeader).toHaveBeenCalledWith('offset', 10);
  });

  it('should return 400 if queries are invalid', async () => {
    req.body = [{ Name: 1 }]; // Missing 'Version'
    await searchPackagesByQueries(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'There is missing field(s) in the PackageQuery or it is formed improperly, or is invalid.',
    });
  });

  it('should return 403 if token is missing', async () => {
    req.headers = {};
    await searchPackagesByQueries(req as Request, res as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication failed due to invalid or missing AuthenticationToken.',
    });
  });

  it('should return 405 if user is not allowed to search', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(false);
    (canISearchQuery as vi.Mock).mockResolvedValue({ rows: [{ can_search: false }] });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({
      error: 'User not allowed to search',
    });
  });

  it('should handle internal server errors and return 500', async () => {
    (jwt.verify as vi.Mock).mockImplementation(() => {
      throw new Error('Invalid token');
    });

    await searchPackagesByQueries(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});



describe("resetRegistry",()=>{

    let req: Partial<Request>;
    let res: Partial<Response>;
  
    beforeEach(() => {
      req = {
        body: [
          { Name: 'package1', Version: '^1.0.0' },
          { Name: 'package2', Version: '~2.3.0' },
        ],
        query: { offset: '0' },
        headers: { 'x-authorization': 'Bearer token' },
      };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      };
    });
  
    afterEach(() => {
      vi.clearAllMocks();
    });
    

    it("should return 200 if the registery is reset successfully",async()=>{


        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
        (resetRegistryQuery as vi.Mock).mockResolvedValue();
    
        await resetRegistry(req as Request, res as Response);
        
        expect(checkIfIamAdmin).toHaveBeenCalledWith(req);
        expect(resetRegistryQuery).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ error: 'Registry is reset' });
    



    })


    it('should return 401 if the user is not  admin permission', async () => {
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(0);
    
        await resetRegistry(req as Request, res as Response);
    
        expect(checkIfIamAdmin).toHaveBeenCalledWith(req);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          error: 'You do not have permission to reset the registry.',
        });
        
      });
    
    it('should return 403 if the user is not authenticated', async () => {
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(-1);
    
        await resetRegistry(req as Request, res as Response);
    
        expect(checkIfIamAdmin).toHaveBeenCalledWith(req);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Authentication failed due to invalid or missing AuthenticationToken.',
        });
        
      });

      it('should return 500 if resetRegistryQuery throws an error', async () => {
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
        (resetRegistryQuery as vi.Mock).mockRejectedValue(new Error('Database error'));
    
        await resetRegistry(req as Request, res as Response);
    
        expect(checkIfIamAdmin).toHaveBeenCalledWith(req);
        expect(resetRegistryQuery).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
        
      });
    


})




describe("getPackageById",()=>{

    let req: Partial<Request>;
    let res: Partial<Response>;
  
    beforeEach(() => {
      req = {
        params: { id: "45" },
        headers: { 'x-authorization': 'Bearer fakeToken' },
      };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
    });
  
    afterEach(() => {
      vi.clearAllMocks();
    });


    it('should return 200 with package metadata and content if all checks pass', async () => {
        const fakeZipContent = Buffer.from('fakeContent', 'utf8');
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(true);
        (canIReadQuery as vi.Mock).mockResolvedValue({ rows: [{ can_download: true }] });
        (getPackageByIDQuery as vi.Mock).mockResolvedValue({
          rows: [{ id: 1, name: 'testPackage', group_id: null, js_program: null, debloat: null, url: null }],
        });
        (downloadFromS3 as vi.Mock).mockResolvedValue(fakeZipContent);
        
        await getPackageByID(req as Request, res as Response);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
          metadata: {
            Name: 'testPackage',
            Version: undefined,
            ID: 1,
          },
          data: {
            Content: fakeZipContent.toString('base64'),
            JSProgram: null,
            debloat: null,
            URL: null,
          },
        });
    })
    
    it('should return 400 if id is missing or improperly formed', async () => {
        if(req.params)
            req.params.id = '';
        await getPackageByID(req as Request, res as Response);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: 'There is missing field(s) in the PackageID or it is formed improperly, or is invalid.',
        });
      });
    
    
    it('should return 403 if authentication token is missing', async () => {
        if(req.headers)
        req.headers['x-authorization'] = '';
        await getPackageByID(req as Request, res as Response);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Authentication failed due to invalid or missing AuthenticationToken.',
        });
    });


    it('should return 403 if token is invalid or expired', async () => {
        (jwt.verify as vi.Mock).mockImplementation(() => {
          throw new Error('TokenExpiredError');
        });
        await getPackageByID(req as Request, res as Response);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Token has expired.',
        });
    });
    

    it('should return 405 if user does not have permission to download', async () => {
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(false);
        (canIReadQuery as vi.Mock).mockResolvedValue({ rows: [{ can_download: false }] });
        await getPackageByID(req as Request, res as Response);
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith({
          error: "sorry you don't have access to download this package ",
        });
      });
    

    it('should return 404 if package does not exist', async () => {
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(false);
        (canIReadQuery as vi.Mock).mockResolvedValue({ rows: [{ can_download: true }] });
        (getPackageByIDQuery as vi.Mock).mockResolvedValue({ rows: [] });
        await getPackageByID(req as Request, res as Response);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Package doesn't exist" });
      });
    
    
    it('should return 405 if package is in a restricted group and user does not belong to that group', async () => {
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(false);
        (canIReadQuery as vi.Mock).mockResolvedValue({ rows: [{ can_download: true }] });
        (getPackageByIDQuery as vi.Mock).mockResolvedValue({
          rows: [{ id: 1, name: 'testPackage', group_id: 123 }],
        });
        (getUserGroupQuery as vi.Mock).mockResolvedValue({ rows: [{ group_id: 456 }] });
        await getPackageByID(req as Request, res as Response);
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith({
          error: "sorry you don't have access to download this package ",
        });
      });
    
    

      



})



describe("searchPackageByRegex",()=>{

    let req: Partial<Request>;
    let res: Partial<Response>;
  
    beforeEach(() => {
      req = {
        body: { RegEx: '^package.*' },
        headers: { 'x-authorization': 'Bearer fakeToken' },
      };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
    });
  
    afterEach(() => {
      vi.clearAllMocks();
    });
  

    it('should return 200 and metadata if an admin searches successfully', async () => {
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
        (searchPackagesByRegExQueryForAdminQuery as vi.Mock).mockResolvedValue({
          rows: [
            { id: 1, name: 'package1', version: '1.0.0' },
            { id: 2, name: 'package2', version: '2.0.0' },
          ],
        });
    
        await searchPackageByRegex(req as Request, res as Response);
    
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([
          {
             Name: 'package1', Version: '1.0.0', ID: 1 
          },
          {
            Name: 'package2', Version: '2.0.0', ID: 2
          },
        ]);
      });
    
    it('should return 200 and metadata if a regular user searches successfully', async () => {
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(0);
        (canISearchQuery as vi.Mock).mockResolvedValue({ rows: [{ can_search: true }] });
        (getUserGroupQuery as vi.Mock).mockResolvedValue({ rows: [{ group_id: 123 }] });
        (searchPackagesByRegExQuery as vi.Mock).mockResolvedValue({
          rows: [
            { id: 3, name: 'package3', version: '3.0.0' },
          ],
        });
    
        await searchPackageByRegex(req as Request, res as Response);
    
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([
            {
              Name: 'package3', Version: '3.0.0', ID: 3
            },
        ]);
        
        });

    it('should return 403 if the token is missing', async () => {
        req.headers = {};
        await searchPackageByRegex(req as Request, res as Response);
    
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Authentication failed due to invalid or missing AuthenticationToken.',
        });
      });
    
    it('should return 403 if the user is not allowed to search', async () => {
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(0);
        (canISearchQuery as vi.Mock).mockResolvedValue({ rows: [{ can_search: false }] });
    
        await searchPackageByRegex(req as Request, res as Response);
    
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'sorry you don\'t have access to search with this regex ',
        });
      });

    it('should return 404 if no packages match the regex', async () => {
        (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
        (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
        (searchPackagesByRegExQueryForAdminQuery as vi.Mock).mockResolvedValue({
          rows: [],
        });
    
        await searchPackageByRegex(req as Request, res as Response);
    
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
          error: 'No package found under this regex ',
        });
      });

    it('should return 400 if an error occurs during execution', async () => {
        (jwt.verify as vi.Mock).mockImplementation(() => {
          throw new Error('Invalid token');
        });
    
        await searchPackageByRegex(req as Request, res as Response);
    
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: 'There is a missing field(s) in the PackageData or it is improperly formed (e.g., Content and URL are both set)',
        });
      });
    
    

})



describe("getPackageHistory",()=>{

  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: { id: 45 },
      headers: { 'x-authorization': 'Bearer fakeToken' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });


  it('should return 200 with package history if the user is an admin and package exists', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (checkPackageExistsQuery as vi.Mock).mockResolvedValue({
      rows: [{ id: 45 }],
    });
    (getPackageHistoryQuery as vi.Mock).mockResolvedValue({
      rows: [{ id: 1, action: 'DOWNLOAD', user_id: 123 }],
    });

    await getPackageHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, action: 'DOWNLOAD', user_id: 123 }]);
  });

  it('should return 401 if the token is missing', async () => {
    req.headers = {};

    await getPackageHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Token missing.' });
  });

  it('should return 402 if the token is invalid', async () => {
    (jwt.verify as vi.Mock).mockImplementation(() => {
      throw new Error('Token not found');
    });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(-1);

    await getPackageHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({ error: 'token not found' });
  });

  it('should return 403 if the user is not an admin', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(0);

    await getPackageHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Only admins are allowed to view package history',
    });
  });

  it('should return 404 if the package does not exist', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (checkPackageExistsQuery as vi.Mock).mockResolvedValue({ rows: [] });

    await getPackageHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "package doesn't exists" });
  });

  it('should return 405 if no history is found for the package', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (checkPackageExistsQuery as vi.Mock).mockResolvedValue({ rows: [{ id: 45 }] });
    (getPackageHistoryQuery as vi.Mock).mockResolvedValue({ rows: [] });

    await getPackageHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'No history found for the specified package' });
  });

  it('should return 500 if an internal error occurs', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (checkPackageExistsQuery as vi.Mock).mockImplementation(() => {
      throw new Error('Database error');
    });

    await getPackageHistory(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });


})



describe("getPackageRating",()=>{

  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      params: { id: '45' },
      headers: { 'x-authorization': 'Bearer fakeToken' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });


  it('should return 200 with package rating if all checks pass', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (canISearchQuery as vi.Mock).mockResolvedValue({ rows: [{ can_search: true }] });
    (canUserAccessPackageQuery as vi.Mock).mockResolvedValue(true);
    (getPackageRatingQuery as vi.Mock).mockResolvedValue({
      rows: [
        {
          ramp_up: 0.8,
          correctness: 0.9,
          bus_factor: 0.7,
          responsive_maintainer: 0.6,
          license_score: 1,
          good_pinning_practice: 1,
          pull_request: 0.9,
          net_score: 0.85,
          ramp_up_latency: 0.1,
          correctness_latency: 0.2,
          bus_factor_latency: 0.1,
          responsive_maintainer_latency: 0.3,
          license_score_latency: 0.05,
          good_pinning_practice_latency: 0.04,
          pull_request_latency: 0.07,
          net_score_latency: 0.15,
        },
      ],
    });

    await getPackageRating(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      RampUp: 0.8,
      Correctness: 0.9,
      BusFactor: 0.7,
      ResponsiveMaintainer: 0.6,
      LicenseScore: 1,
      GoodPinningPractice: 1,
      PullRequest: 0.9,
      NetScore: 0.85,
      RampUpLatency: 0.1,
      CorrectnessLatency: 0.2,
      BusFactorLatency: 0.1,
      ResponsiveMaintainerLatency: 0.3,
      LicenseScoreLatency: 0.05,
      GoodPinningPracticeLatency: 0.04,
      PullRequestLatency: 0.07,
      NetScoreLatency: 0.15,
    });
  });

  it('should return 400 if package ID is missing or invalid', async () => {
    
      req.params.id = undefined;

    await getPackageRating(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'There is missing field(s) in the PackageID',
    });
  });

  it('should return 402 if user does not have permission to get the rating', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(0);
    (canISearchQuery as vi.Mock).mockResolvedValue({ rows: [{ can_search: false }] });

    await getPackageRating(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      error: 'sorry you are not allowed to get the rating ',
    });
  });
  it('should return 403 if the token is missing', async () => {
    req.headers = {};

    await getPackageRating(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication failed due to invalid or missing AuthenticationToken.',
    });
  });


  it('should return 403 if the token is expired', async () => {
    (jwt.verify as vi.Mock).mockImplementation(() => {
      throw new Error('TokenExpiredError');
    });

    await getPackageRating(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Token has expired.',
    });
  });

  it('should return 404 if the package does not exist', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (getPackageRatingQuery as vi.Mock).mockResolvedValue({ rows: [] });

    await getPackageRating(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "Package doesn't exists",
    });
  });


  it('should return 500 if any metric is -1', async () => {
    (jwt.verify as vi.Mock).mockReturnValue({ sub: 1 });
    (checkIfIamAdmin as vi.Mock).mockResolvedValue(1);
    (getPackageRatingQuery as vi.Mock).mockResolvedValue({
      rows: [
        {
          ramp_up: -1,
          correctness: 0.9,
          bus_factor: 0.7,
          responsive_maintainer: 0.6,
          license_score: 1,
          good_pinning_practice: 1,
          pull_request: 0.9,
          net_score: 0.85,
          ramp_up_latency: 0.1,
          correctness_latency: 0.2,
          bus_factor_latency: 0.1,
          responsive_maintainer_latency: 0.3,
          license_score_latency: 0.05,
          good_pinning_practice_latency: 0.04,
          pull_request_latency: 0.07,
          net_score_latency: 0.15,
        },
      ],
    });

    await getPackageRating(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'The package rating system choked on at least one of the metrics.',
    });
  });

 




 
})

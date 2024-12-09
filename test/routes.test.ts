import request from 'supertest';
import express from 'express';
import router from '../src/routes';  // Import the routes file you want to test
import{describe,it,beforeEach,afterEach, expect,vi} from 'vitest';
// Set up the express app for testing
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies
app.use(router); // Use the routes from your routes file
describe('Testing Routes', () => {
  // Test for the default route
  let mockClient: vi.Mocked<PoolClient>;
  afterEach(() => {
    vi.clearAllMocks(); // Clear previous mocks
  });
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),  // Mock the query function
    } as unknown as vi.Mocked<PoolClient>;
  });

  // Test for /packages POST route
  it('should call searchPackages handler when POST /packages is called', async () => {
    const response = await request(app).post('/packages').send({ query: 'test' });
    expect(response.status).toBe(400); // Adjust status code as per your actual implementation
    // Optionally, you can check the response body
  });
  // Test for /package/:id GET route
  /*it('should call getPackageByID handler when GET /package/:id is called', async () => {
    const response = await request(app).get('/package/123');
    expect(response.status).toBe(500); // Adjust status code as per your actual implementation
    // Optionally, check response content
  });
*/
  // You can similarly add tests for other routes
});
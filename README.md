# Phase 2: Package Manager Project – Backend

![License](https://img.shields.io/badge/license-MIT-green)  
![TypeScript](https://img.shields.io/badge/typescript-v4.0.0+-blue)
## Project Overview

The **Package Manager API** serves as a registry for JavaScript packages, enabling you to **store**, **evaluate**, and **manage** them. It offers version control, an automated rating system, download size calculations, and administrative controls for overseeing the entire package registry. By evaluating key metrics (such as ramp-up time, overall correctness, and license considerations), this API strives to provide a secure and dependable environment for package management.

---
## Key Features

- **Rich Package Evaluation**: Rates packages based on ramp-up time, correctness, and license to aid in decision-making.  
- **Cost Calculation**: Estimates download size, optionally factoring in dependencies.  
- **Regex-Based Search**: Finds packages by matching keywords in names or READMEs.  
- **Admin Controls**: Reset the registry, manage user groups, and track package histories.  
- **Debloat Option**: Helps save space by removing unnecessary files during upload.  

---

## Technologies Used

- **Node.js** with **Express**  
- **TypeScript**  
- **PostgreSQL** or **AWS RDS** (for data)  
- **AWS S3** (for file storage)  
- **GitHub Actions** (for CI/CD)  
- **Vitest** (for testing)


## Endpoints Overview

### Baseline Endpoints

1. **`POST /packages`**  
   - **Purpose**: Retrieve a list of packages that match a given query.  
   - **Features**: Pagination via an `offset` header.  
   - **Errors**:  
     - `400` – Invalid fields  
     - `403` – Authentication failure  
     - `413` – Too many packages returned  

2. **`GET /package/{id}`**  
   - **Purpose**: Fetch detailed info (metadata, content) for a specific package.  
   - **Errors**:  
     - `400` – Invalid fields  
     - `403` – Authentication failure  
     - `404` – Package not found  

3. **`POST /package/{id}`**  
   - **Purpose**: Update an existing package with a new version.  
   - **Errors**:  
     - `400` – Invalid fields  
     - `403` – Authentication failure  
     - `404` – Package not found  

4. **`DELETE /reset`**  
   - **Purpose**: Reset the registry to its default state.  
   - **Errors**:  
     - `401` – Insufficient permissions  
     - `403` – Authentication failure  

5. **`POST /package`**  
   - **Purpose**: Upload a new package.  
   - **Options**:  
     - `Content` (Base64-encoded zip) or `URL`  
     - `debloat` for storage optimization  
   - **Errors**:  
     - `400` – Invalid/conflicting fields  
     - `403` – Authentication failure  
     - `409` – Package already exists  
     - `424` – Package disqualified due to poor rating  

6. **`GET /package/{id}/rate`**  
   - **Purpose**: Retrieve the rating metrics (e.g., ramp-up, correctness, license).  
   - **Errors**:  
     - `400` – Invalid Package ID  
     - `403` – Authentication failure  
     - `404` – Package not found  
     - `500` – Rating system error  

7. **`GET /package/{id}/cost`**  
   - **Purpose**: Calculate download cost (in MB), with optional dependencies.  
   - **Errors**:  
     - `400` – Invalid Package ID  
     - `403` – Authentication failure  
     - `404` – Package not found  
     - `500` – Dependency resolution error  

8. **`PUT /authenticate`**  
   - **Purpose**: Obtain an access token for secure endpoints.  
   - **Errors**:  
     - `400` – Invalid input  
     - `401` – Incorrect credentials  
     - `501` – Not implemented  

9. **`POST /package/byRegEx`**  
   - **Purpose**: Search packages by regex over names and READMEs.  
   - **Errors**:  
     - `400` – Invalid regex  
     - `403` – Authentication failure  
     - `404` – No packages found  

### Access Control Endpoints

1. **`POST /logout`**  
   - **Purpose**: Logs out the authenticated user.  
   - **Errors**:  
     - `500` – Internal server error  

2. **`GET /Access/{user_id}`** / **`POST /Access/{user_id}`**  
   - **Purpose**: View or modify user permissions (Admin only).  
   - **Errors**:  
     - `403` – Only admins allowed  
     - `500` – Internal server error  

### Group Management Endpoints

1. **`POST /group`**  
   - **Purpose**: Create a new group (Admin only).  
   - **Errors**:  
     - `403` – Only admins allowed  
     - `500` – Internal server error  

2. **`POST /add_user/{groupid}`**  
   - **Purpose**: Assign a user to a group (Admin only).  
   - **Errors**:  
     - `403` – Only admins allowed  
     - `500` – Internal server error  

3. **`POST /add_package/{groupid}`**  
   - **Purpose**: Add a package to a group (Admin only).  
   - **Errors**:  
     - `403` – Only admins allowed  
     - `500` – Internal server error  

4. **`GET /groups`**  
   - **Purpose**: Retrieve a list of all groups (Admin only).  
   - **Errors**:  
     - `403` – Only admins allowed  
     - `500` – Internal server error  

5. **`GET /groups/{groupid}`**  
   - **Purpose**: Retrieve users assigned to a specific group (Admin only).  
   - **Errors**:  
     - `403` – Only admins allowed  
     - `500` – Internal server error  

### History Management

1. **`POST /history`**  
   - **Purpose**: Get the history of a specific package (Admin only).  
   - **Errors**:  
     - `403` – Only admins allowed  
     - `500` – Internal server error  

---


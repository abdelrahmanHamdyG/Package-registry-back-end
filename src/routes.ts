import { Router } from "express";
import { Request, Response } from "express";
import {
  getPackageByID,
  getPackageByName,
  updatePackageByID,
  deletePackageByID,
  uploadPackage,
  //searchPackages,
  resetRegistry,
  getPackageRating,
  // searchPackagesByRegEx,
} from "./controller.js";  // Ensure the correct path

const router = Router();

// Default route for invalid endpoints
router.get("", (req: Request, res: Response) => {
  res.send("You are not at a valid endpoint. Try using '/package' or other routes.");
});

// POST /packages - Search packages by query
//router.post("/packages", searchPackages);

// DELETE /reset - Reset the registry
router.delete("/reset", resetRegistry);

// GET /pckage/:id - Get package by ID
router.get("/package/:id", getPackageByID);

// GET /package/byName/:name - Get package by name
router.get("/package/byName/:name", getPackageByName);

// PUT /package/:id - Update package by ID
router.put("/package/:id", updatePackageByID);

// DELETE /package/:id - Delete package by ID
router.delete("/package/:id", deletePackageByID);

// POST /package - Upload new package
router.post("/package", uploadPackage);

// GET /package/:id/rate - Get package rating by ID
router.get("/package/:id/rate", getPackageRating);

// POST /package/byRegEx - Search packages by regular expression
// router.post("/package/byRegEx", searchPackagesByRegEx);

export default router;  // Export router for use in the app

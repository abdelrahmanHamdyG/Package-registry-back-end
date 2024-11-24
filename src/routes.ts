import { Router } from "express";
import { Request, Response } from "express";
import { get_package_rating, getPackageByID, resetRegistry, searchPackageByRegex, searchPackagesByQueries, updatePackage, uploadPackage,authenticate, trackDetails,registerNewUser,  createGroup, assignUserToGroup, assignPackageToGroup, getAllGroups, getUsersByGroup, logout, updateUserAccess, getUserAccess} from "./controller.js";  // Ensure the correct path

const router = Router();

// Default route for invalid endpoints
router.get("", (req: Request, res: Response) => {
  res.send("You are not at a valid endpoint. Try using '/package' or other routes.");
});


router.get("/package/:id/rate", get_package_rating);
router.post("/Access/:user_id",updateUserAccess)
router.get("/Access/:user_id",getUserAccess)

router.post("/packages", searchPackagesByQueries);

// DELETE /reset - Reset the registry
router.delete("/reset", resetRegistry);

// GET /pckage/:id - Get package by ID
router.get("/package/:id", getPackageByID);

// // PUT /package/:id - Update package by ID


router.post("/package/byRegEx", searchPackageByRegex);
router.post("/package/:id", updatePackage);


// // DELETE /package/:id - Delete package by ID
// router.delete("/package/:id", deletePackageByID);

// POST /package - Upload new package
router.post("/package", uploadPackage);


router.put("/authenticate",authenticate)
router.get("/tracks",trackDetails)
router.post("/register",registerNewUser)

router.post("/group",createGroup)
router.post("/:groupid/add_user",assignUserToGroup)
router.post("/:groupid/add_package",assignPackageToGroup)

router.get("/groups",getAllGroups)
router.get("/groups/:groupid",getUsersByGroup)
router.post("/logout/",logout)

// POST /package/byRegEx - Search packages by regular expression
 

export default router;  // Export router for use in the app

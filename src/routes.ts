import { Router } from "express";
import { Request, Response } from "express";
import { trackDetails,} from "./controllers/utility_controller.js";  // Ensure the correct path
import { getPackageByID, getPackageHistory, getPackageRating, packageCost, resetRegistry, searchPackageByRegex, searchPackagesByQueries, updatePackage, uploadPackage } from "./controllers/packages_controller.js";
import { authenticate, getUserAccess, logout, registerNewUser, updateUserAccess } from "./controllers/users_controller.js";
import { assignPackageToGroup, assignUserToGroup, createGroup, getAllGroups, getUsersByGroup } from "./controllers/groups_controller.js";

const router = Router();

// Default route for invalid endpoints
router.get("", (req: Request, res: Response) => {
  res.send("You are not at a valid endpoint. Try using '/package' or other routes.");
});


router.get("/package/:id/rate", getPackageRating);
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
router.post("/add_user/:groupid",assignUserToGroup)
router.post("/add_package/:groupid",assignPackageToGroup)

router.get("/groups",getAllGroups)
router.get("/groups/:groupid",getUsersByGroup)
router.post("/logout/",logout)

router.post("/history",getPackageHistory)
router.get("/package/:id/cost",packageCost)
// POST /package/byRegEx - Search packages by regular expression

export default router;  // Export router for use in the app

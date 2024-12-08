import { Router } from "express";
import {  trackDetails,} from "./controllers/utility_controller.js";  // Ensure the correct path
import { getPackageByID, getPackageHistory, getPackageRating, packageCost, resetRegistry, searchPackageByRegex, searchPackagesByQueries, updatePackage, uploadPackage } from "./controllers/packages_controller.js";
import { authenticate, getUserAccess, logout, registerNewUser, updateUserAccess } from "./controllers/users_controller.js";
import { assignPackageToGroup, assignUserToGroup, createGroup, getAllGroups, getUsersByGroup } from "./controllers/groups_controller.js";

const router = Router();



router.get("/package/:id/rate", getPackageRating);
router.post("/packages", searchPackagesByQueries);
router.get("/package/:id", getPackageByID);
router.post("/package/byRegEx", searchPackageByRegex);
router.post("/package/:id", updatePackage);
router.get("/package/:id/cost",packageCost)
router.put("/authenticate",authenticate)
router.delete("/reset", resetRegistry);
router.post("/package", uploadPackage);
router.get("/tracks",trackDetails)


// track endpoints
router.post("/logout/",logout)
router.post("/Access/:user_id",updateUserAccess)
router.get("/Access/:user_id",getUserAccess)
router.post("/register",registerNewUser)
router.post("/group",createGroup)
router.post("/add_user/:groupid",assignUserToGroup)
router.post("/add_package/:groupid",assignPackageToGroup)
router.get("/groups",getAllGroups)
router.get("/groups/:groupid",getUsersByGroup)
router.post("/history",getPackageHistory)


export default router;  

import { Router } from "express";
import { Request,Response } from "express";
import {
  getPackageByID,
  getPackageByName,
  updatePackageByID,
  deletePackageByID,
  uploadPackage,
} from "./controller.js";  // Make sure the path is correct relative to the location of this file

const router = Router();

router.get("",(req:Request,res:Response)=>{

    res.send("you are not at valid end point you may add /package or something else ");
})
router.get("/package/:id", getPackageByID);
router.get("/package/byName/:name", getPackageByName);

router.put("/package/:iid", updatePackageByID);
router.delete("/package/:iid", deletePackageByID);

router.post("/package", uploadPackage);

export default router;  // Export router for use in other parts of the app

import { Request, Response } from "express";

export const getPackageByID = (req: Request, res: Response) => {
  const packageID = req.params.id;
  res.send(`Getting package with ID: ${packageID}`);
};

export const getPackageByName = (req: Request, res: Response) => {
  const packageName = req.params.name;
  res.send(`Getting package with name: ${packageName}`);
};

export const updatePackageByID = (req: Request, res: Response) => {
  const packageID = req.params.iid;
  res.send(`Updating package with ID: ${packageID}`);
};

export const deletePackageByID = (req: Request, res: Response) => {
  const packageID = req.params.iid;
  res.send(`Deleting package with ID: ${packageID}`);
};

export const uploadPackage = (req: Request, res: Response) => {
  res.send("Uploading new package");
};

import express from "express";
import { Request,Response } from "express";
import router from "./routes.js"; 
import cors from "cors"
import bodyParser from "body-parser";
const app = express();

//this last commit was to update github token as we said on piazza 

app.use(cors())

app.use(bodyParser.json({ limit: "50mb" }))

app.use("/", router);  

const PORT =  3000;

app.listen(PORT, () => {
  console.log("Server is running ");
});

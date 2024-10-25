import express from "express";
import { Request,Response } from "express";
import router from "./routes.js"; 
import cors from "cors"
const app = express();


app.use(cors())
app.use(express.json()); 


app.use("/", router);  

const PORT =  3000;

app.listen(PORT, () => {
  console.log("Server is running ");
});

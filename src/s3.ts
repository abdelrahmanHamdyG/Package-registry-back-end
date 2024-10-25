import { S3Client, PutObjectCommand,GetObjectCommand } from "@aws-sdk/client-s3";
import {Readable} from "stream"

// AWS configuration (assumed to be in .env or environment variables)
const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_BUCKET_REGION;
const accessKeyID = process.env.AWS_ACCESS_KEY;
const accessKeyPassword = process.env.AWS_SECRET_KEY;

// Initialize the S3 client
const s3Client = new S3Client({
  region: region,
  credentials: {
    accessKeyId: accessKeyID!, // Your AWS access key
    secretAccessKey: accessKeyPassword!, // Your AWS secret key
  },
});

const streamToBuffer = (stream: Readable): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  };
  
  export const getFile = async (bucketName: string, key: string): Promise<Buffer> => {
    try {
      // Create the command to get the file
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
  
      // Send the command to S3
      const response = await s3Client.send(command);
  
      // The Body is a stream, so convert it to a buffer
      const fileBuffer = await streamToBuffer(response.Body as Readable);
      return fileBuffer;
    } catch (err) {
      console.error("Error getting file from S3:", err);
      throw err;
    }
  };
  
export const UploadFileToS3 = async (fileKey: string, fileContent: string) => {
  
    // Create the text file content as a buffer
    console.log("we are uploadin the file ")
    const fileBody = Buffer.from(fileContent, 'utf-8');

    // Create the upload parameters
    const uploadParams = {
      Bucket: bucketName,  // The S3 bucket name
      Key: fileKey,        // The file name in the S3 bucket
      Body: fileBody,      // The file content (as buffer)
      ContentType: 'text/plain', // Specify the file type as plain text
    };

    // Upload the file to S3
    const command = new PutObjectCommand(uploadParams);
    await  s3Client.send(command);
};

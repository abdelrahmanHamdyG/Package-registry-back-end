import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import mime from "mime-types"; // Import mime-types for dynamic ContentType

// Initialize the S3 client
const s3Client = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
  },
});

// Stream helper function
const streamToBuffer = (stream: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
};

export const uploadZipToS3 = async (
  key: string,
  fileStream: fs.ReadStream,
  contentType: string
) => {
  const s3Params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  };

  try {
    const result = await s3Client.send(new PutObjectCommand(s3Params));
    console.log(`File uploaded successfully:`, result);
    return result;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};




export const getFile = async (bucketName: string, key: string): Promise<Buffer> => {
  try {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const response = await s3Client.send(command);
    return streamToBuffer(response.Body as Readable);
  } catch (err) {
    console.error("Error getting file from S3:", err);
    throw err;
  }
};

export const UploadFileToS3 = async (fileKey: string, filePath: string) => {
  console.log("Uploading file to S3");
  const fileStream = fs.createReadStream(filePath);

  // Dynamically set ContentType based on file extension
  const contentType = mime.lookup(filePath) || "application/octet-stream";

  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileKey,
    Body: fileStream,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(uploadParams);
  await s3Client.send(command);
};

export async function uploadDirectoryToS3(directoryPath: string, s3PathPrefix: string) {
  const items = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(directoryPath, item.name);
    const s3Key = path.join(s3PathPrefix, item.name);

    if (item.isDirectory()) {
      await uploadDirectoryToS3(fullPath, s3Key);
    } else {
      await UploadFileToS3(s3Key, fullPath);
    }
  }

}

export async function uploadBase64ToS3(base64Content:string, key:string) {
  try {
    // Decode the Base64 content to a binary buffer
    const fileBuffer = Buffer.from(base64Content, 'base64');

    // Set up the parameters for S3
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: 'application/zip',
    };

    // Upload the file
    const data = await s3Client.send(new PutObjectCommand(uploadParams));
    console.log('File uploaded successfully:', data);
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}



import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import fs from "fs";

// Initialize the S3 client
const s3Client = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
  },
});

// Stream helper function
export const downloadFromS3 = async (key: string): Promise<Buffer> => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
  };

  try {
    const data = await s3Client.send(new GetObjectCommand(params));
    return await streamToBuffer(data.Body as Readable);
  } catch (error) {
    console.error('Error downloading from S3:', error);
    throw error;
  }
};

const streamToBuffer = (stream: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
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



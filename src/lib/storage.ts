import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestError } from "./errors";

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || "https://placeholder-endpoint.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "placeholder-id",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "placeholder-secret",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "placement-platform-uploads";

// Generate a 1-hour pre-signed GET download URL for secure resources
export const getDownloadPresignedUrl = async (key: string): Promise<string> => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    // Enforce strictly a 3600-second (1-hour) link lifetime limit
    return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  } catch (error) {
    console.error("Failed to generate download presigned URL:", error);
    throw new BadRequestError("Could not retrieve secure download link");
  }
};

// Generate a secure pre-signed PUT upload URL that enforces exact size limits and MIME types
export const getUploadPresignedUrl = async (
  key: string,
  mimeType: string,
  contentLengthBytes: number
): Promise<string> => {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
      ContentLength: contentLengthBytes,
    });
    
    // Upload links expire in 15 minutes
    return await getSignedUrl(r2Client, command, { expiresIn: 900 });
  } catch (error) {
    console.error("Failed to generate upload presigned URL:", error);
    throw new BadRequestError("Could not retrieve secure upload authorization");
  }
};

// Uploads a direct file buffer (useful for small assets like Avatars) to storage
export const uploadBuffer = async (
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<string> => {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });
    
    await r2Client.send(command);
    return `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;
  } catch (error) {
    console.error("Failed to upload buffer to S3/R2:", error);
    throw new BadRequestError("File upload operation failed");
  }
};

// Deletes an object from the S3/R2 storage bucket
export const deleteFile = async (key: string): Promise<void> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await r2Client.send(command);
  } catch (error) {
    console.error("Failed to delete file from S3/R2:", error);
  }
};

// Enforces strict file validation (MIME structures and sizes) before server buffering
export const validateFileBuffer = (
  buffer: Buffer,
  allowedMimeTypes: string[],
  maxSizeBytes: number,
  detectedMime: string
): void => {
  if (buffer.length > maxSizeBytes) {
    throw new BadRequestError(
      `File size exceeds the limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB`
    );
  }
  
  if (!allowedMimeTypes.includes(detectedMime)) {
    throw new BadRequestError(
      `Invalid file format. Allowed formats: ${allowedMimeTypes.join(", ")}`
    );
  }
};

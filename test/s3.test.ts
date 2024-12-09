import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import { downloadFromS3, uploadZipToS3, uploadBase64ToS3 } from '../src/s3'; // Adjust path as needed
import { Readable } from 'stream';

// Mock environment variables if needed
process.env.AWS_BUCKET_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY = 'fakeAccessKey';
process.env.AWS_SECRET_KEY = 'fakeSecretKey';
process.env.AWS_BUCKET_NAME = 'fake-bucket';

// Mock S3Client
vi.mock('@aws-sdk/client-s3', async (importActual) => {
  const actual = await importActual<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn()
    }))
  }
});

const s3ClientMock = (S3Client as unknown as vi.Mock).mock.results[0].value;

// Mock fs if necessary
vi.mock('fs', () => {
  return {
    ...vi.importActual('fs'),
    createReadStream: vi.fn(),
  };
});

describe('S3 utilities', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('downloadFromS3', () => {
    it('should download a file from S3 and return a buffer', async () => {
      // Mock S3 response
      const mockBody = new Readable();
      const testContent = Buffer.from('test content');
      mockBody.push(testContent);
      mockBody.push(null);

      s3ClientMock.send.mockResolvedValue({ Body: mockBody });

      const result = await downloadFromS3('test-key');
      expect(result).toEqual(testContent);
      expect(s3ClientMock.send).toHaveBeenCalledTimes(1);
      const command = s3ClientMock.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input.Key).toBe('test-key');
    });

    it('should throw error if download fails', async () => {
      s3ClientMock.send.mockRejectedValue(new Error('S3 error'));

      await expect(downloadFromS3('missing-key')).rejects.toThrow('S3 error');
      expect(s3ClientMock.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadZipToS3', () => {
    it('should upload a file stream to S3 successfully', async () => {
      s3ClientMock.send.mockResolvedValue({ ETag: '"some-etag"' });
      const fileStream = new Readable();
      fileStream.push('zip content');
      fileStream.push(null);

      await uploadZipToS3('upload-key', fileStream as unknown as fs.ReadStream, 'application/zip');
      expect(s3ClientMock.send).toHaveBeenCalledTimes(1);
      const command = s3ClientMock.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Key).toBe('upload-key');
      expect(command.input.ContentType).toBe('application/zip');
    });

    it('should throw error if upload fails', async () => {
      s3ClientMock.send.mockRejectedValue(new Error('Upload error'));
      const fileStream = new Readable();
      fileStream.push('zip content');
      fileStream.push(null);

      await expect(uploadZipToS3('fail-key', fileStream as unknown as fs.ReadStream, 'application/zip'))
        .rejects.toThrow('Upload error');
      expect(s3ClientMock.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadBase64ToS3', () => {
    it('should upload base64 content to S3 successfully', async () => {
      s3ClientMock.send.mockResolvedValue({ ETag: '"some-etag"' });

      const base64Content = Buffer.from('base64 content').toString('base64');
      await uploadBase64ToS3(base64Content, 'base64-key');

      expect(s3ClientMock.send).toHaveBeenCalledTimes(1);
      const command = s3ClientMock.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Key).toBe('base64-key');
      expect(command.input.ContentType).toBe('application/zip');
      const bodyBuffer = command.input.Body as Buffer;
      expect(bodyBuffer.toString()).toBe('base64 content');
    });

    it('should not throw error but log if upload fails', async () => {
      s3ClientMock.send.mockRejectedValue(new Error('Upload error'));
      const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});

      const base64Content = Buffer.from('content').toString('base64');
      await uploadBase64ToS3(base64Content, 'failing-key');

      expect(s3ClientMock.send).toHaveBeenCalledTimes(1);
      expect(consoleErrorMock).toHaveBeenCalledWith('Error uploading file:', new Error('Upload error'));
      consoleErrorMock.mockRestore();
    });
  });
});

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

export type UploadFolder = 'products' | 'Category' | 'Bill' | 'Others';

export const VALID_FOLDERS: UploadFolder[] = ['products', 'Category', 'Bill', 'Others'];

export interface UploadResult {
  url: string;
  key: string;
  folder: UploadFolder;
  filename: string;
  size: number;
  mimeType: string;
  isCloudFront: boolean;
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private region: string;
  private cloudFrontUrl: string | null = null;
  private isConfigured = false;
  private localUploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    this.region = process.env.AWS_REGION || 'ap-south-1';
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME || '';
    
    // CloudFront CDN domain
    const cf = process.env.AWS_CLOUDFRONT_URL || process.env.CLOUDFRONT_URL || '';
    if (cf) {
      let trimmed = cf.trim().replace(/\/+$/, '');
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        trimmed = `https://${trimmed}`;
      }
      this.cloudFrontUrl = trimmed;
    }

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';

    if (accessKeyId && secretAccessKey && this.bucketName) {
      try {
        this.s3Client = new S3Client({
          region: this.region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
        this.isConfigured = true;
        this.logger.log(`✅ AWS S3 Client initialized. Bucket: ${this.bucketName}, Region: ${this.region}`);
        if (this.cloudFrontUrl) {
          this.logger.log(`🚀 AWS CloudFront CDN active: ${this.cloudFrontUrl}`);
        } else {
          this.logger.warn(`⚠️ AWS_CLOUDFRONT_URL not set. Falling back to direct S3 URLs.`);
        }
      } catch (err: any) {
        this.logger.error(`Failed to initialize AWS S3 Client: ${err.message}`);
      }
    } else {
      this.logger.warn(
        `⚠️ AWS S3 credentials missing (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME). ` +
        `Using local fallback directory: ${this.localUploadDir}`,
      );
    }

    // Ensure local directories exist for all 4 folders
    this.ensureLocalDirectories();
  }

  async onModuleInit() {
    if (this.isConfigured) {
      await this.ensureS3Folders();
    }
  }

  /**
   * Ensures local directories exist for the 4 folders (used as fallback or local cache)
   */
  private ensureLocalDirectories() {
    try {
      if (!fs.existsSync(this.localUploadDir)) {
        fs.mkdirSync(this.localUploadDir, { recursive: true });
      }
      for (const folder of VALID_FOLDERS) {
        const folderPath = path.join(this.localUploadDir, folder);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not create local upload directory: ${err.message}`);
    }
  }

  /**
   * Ensures the 4 required folders exist in the AWS S3 Bucket:
   *   - products
   *   - Category
   *   - Bill
   *   - Others
   */
  async ensureS3Folders(): Promise<{ created: string[]; errors: string[] }> {
    if (!this.s3Client || !this.bucketName) {
      return { created: [], errors: ['S3 is not configured'] };
    }

    const created: string[] = [];
    const errors: string[] = [];

    for (const folder of VALID_FOLDERS) {
      const folderKey = `${folder}/`;
      try {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: folderKey,
          Body: Buffer.alloc(0),
          ContentType: 'application/x-directory',
        });
        await this.s3Client.send(command);
        created.push(folderKey);
        this.logger.log(`📁 S3 Folder verified/created: s3://${this.bucketName}/${folderKey}`);
      } catch (err: any) {
        this.logger.warn(`Warning creating S3 folder marker for ${folderKey}: ${err.message}`);
        errors.push(`${folderKey}: ${err.message}`);
      }
    }

    return { created, errors };
  }

  /**
   * Normalize input folder into one of the 4 exact required folder names:
   *   'products' | 'Category' | 'Bill' | 'Others'
   */
  normalizeFolder(folderInput?: string): UploadFolder {
    if (!folderInput) return 'Others';
    const lower = folderInput.trim().toLowerCase();
    if (lower === 'products' || lower === 'product' || lower === 'product_image') {
      return 'products';
    }
    if (lower === 'category' || lower === 'categories' || lower === 'cat') {
      return 'Category';
    }
    if (
      lower === 'bill' ||
      lower === 'bills' ||
      lower === 'invoice' ||
      lower === 'payment' ||
      lower === 'payment_proof' ||
      lower === 'receipt'
    ) {
      return 'Bill';
    }
    return 'Others';
  }

  /**
   * Constructs the public CDN URL using CloudFront (if set) or direct S3
   */
  getPublicUrl(key: string): { url: string; isCloudFront: boolean } {
    if (this.cloudFrontUrl) {
      const cleanKey = key.replace(/^\/+/, '');
      return {
        url: `${this.cloudFrontUrl}/${cleanKey}`,
        isCloudFront: true,
      };
    }
    if (this.bucketName) {
      return {
        url: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`,
        isCloudFront: false,
      };
    }
    // Local fallback
    const port = process.env.PORT || 4000;
    return {
      url: `http://localhost:${port}/api/uploads/${key}`,
      isCloudFront: false,
    };
  }

  /**
   * Upload binary Buffer to S3 & CloudFront
   */
  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folderInput?: string,
  ): Promise<UploadResult> {
    const folder = this.normalizeFolder(folderInput);
    const ext = this.getExtension(originalName, mimeType);
    const cleanBase = path
      .basename(originalName, path.extname(originalName))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'asset';

    const filename = `${cleanBase}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const s3Key = `${folder}/${filename}`;

    if (this.s3Client && this.bucketName) {
      try {
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        });

        await this.s3Client.send(command);
        const { url, isCloudFront } = this.getPublicUrl(s3Key);

        this.logger.log(`Uploaded to S3: ${s3Key} -> ${url}`);
        return {
          url,
          key: s3Key,
          folder,
          filename,
          size: buffer.length,
          mimeType,
          isCloudFront,
        };
      } catch (err: any) {
        this.logger.error(`S3 upload failed: ${err.message}. Saving to local fallback.`);
      }
    }

    // Local file fallback
    const localTargetDir = path.join(this.localUploadDir, folder);
    if (!fs.existsSync(localTargetDir)) {
      fs.mkdirSync(localTargetDir, { recursive: true });
    }
    const localFilePath = path.join(localTargetDir, filename);
    fs.writeFileSync(localFilePath, buffer);

    const { url, isCloudFront } = this.getPublicUrl(s3Key);
    return {
      url,
      key: s3Key,
      folder,
      filename,
      size: buffer.length,
      mimeType,
      isCloudFront,
    };
  }

  /**
   * Upload base64 encoded data (data:image/webp;base64,...)
   */
  async uploadBase64(
    base64Data: string,
    originalName = 'image',
    folderInput?: string,
  ): Promise<UploadResult> {
    if (!base64Data || typeof base64Data !== 'string') {
      throw new Error('Invalid base64 image data');
    }

    let mimeType = 'image/webp';
    let rawBase64 = base64Data;

    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        rawBase64 = match[2];
      } else {
        const commaIdx = base64Data.indexOf(',');
        if (commaIdx !== -1) {
          rawBase64 = base64Data.slice(commaIdx + 1);
        }
      }
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    return this.uploadBuffer(buffer, originalName, mimeType, folderInput);
  }

  private getExtension(filename: string, mimeType: string): string {
    const fromPath = path.extname(filename);
    if (fromPath && fromPath.length <= 5) return fromPath.toLowerCase();

    switch (mimeType) {
      case 'image/webp':
        return '.webp';
      case 'image/png':
        return '.png';
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/svg+xml':
        return '.svg';
      case 'image/gif':
        return '.gif';
      case 'application/pdf':
        return '.pdf';
      default:
        return '.webp';
    }
  }

  /**
   * Returns current S3 & CloudFront configuration status
   */
  getConfigStatus() {
    return {
      isConfigured: this.isConfigured,
      bucketName: this.bucketName || 'Not Configured',
      region: this.region,
      cloudFrontUrl: this.cloudFrontUrl || 'Not Configured (Direct S3 fallback)',
      folders: VALID_FOLDERS,
    };
  }
}

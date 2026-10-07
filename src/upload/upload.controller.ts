import {
  Controller,
  Post,
  Get,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadService, UploadFolder } from './upload.service';

@ApiTags('File Uploads (AWS S3 & CloudFront)')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get current AWS S3 and CloudFront CDN configuration status & folder list' })
  getConfig() {
    return {
      success: true,
      data: this.uploadService.getConfigStatus(),
    };
  }

  @Post('init-folders')
  @ApiOperation({ summary: 'Create/verify the 4 required folders in AWS S3 (products, Category, Bill, Others)' })
  async initFolders() {
    const res = await this.uploadService.ensureS3Folders();
    return {
      success: true,
      message: 'S3 folders verified and initialized',
      data: res,
    };
  }

  @Post('single')
  @ApiOperation({ summary: 'Upload a single file (image/doc) to AWS S3 & CloudFront' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: {
          type: 'string',
          enum: ['products', 'Category', 'Bill', 'Others'],
          description: 'Destination folder in S3',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: UploadFolder,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    const result = await this.uploadService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      folder,
    );

    return {
      success: true,
      message: `File uploaded successfully to ${result.folder}/ via ${result.isCloudFront ? 'CloudFront CDN' : 'S3'}`,
      data: result,
    };
  }

  @Post('base64')
  @ApiOperation({ summary: 'Upload a base64 encoded image to AWS S3 & CloudFront' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', description: 'Base64 image data (data:image/webp;base64,...)' },
        folder: {
          type: 'string',
          enum: ['products', 'Category', 'Bill', 'Others'],
          description: 'Destination folder in S3',
        },
        filename: { type: 'string', description: 'Optional base filename' },
      },
    },
  })
  async uploadBase64(
    @Body() body: { image: string; folder?: UploadFolder; filename?: string },
  ) {
    if (!body || !body.image) {
      throw new BadRequestException('Image data (base64) is required');
    }

    const result = await this.uploadService.uploadBase64(
      body.image,
      body.filename || 'upload',
      body.folder,
    );

    return {
      success: true,
      message: `Image uploaded successfully to ${result.folder}/ via ${result.isCloudFront ? 'CloudFront CDN' : 'S3'}`,
      data: result,
    };
  }
}

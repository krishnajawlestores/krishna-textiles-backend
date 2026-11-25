import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString() @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: 'New password: at least 8 characters, at most 72 UTF-8 bytes' })
  @IsString() @MinLength(8) @MaxLength(72)
  newPassword: string;
}

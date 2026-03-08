import { ApiProperty } from '@nestjs/swagger'

export class UploadMediaDto {
  @ApiProperty({ type: 'string', format: 'binary', description: '上传文件' })
  file: Express.Multer.File
}

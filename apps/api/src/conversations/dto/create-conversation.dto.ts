import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  dataSourceId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

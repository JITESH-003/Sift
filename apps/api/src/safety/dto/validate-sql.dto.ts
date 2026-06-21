import { IsString, MaxLength } from 'class-validator';

export class ValidateSqlDto {
  @IsString()
  @MaxLength(10000)
  sql: string;
}

import { IsString, MaxLength } from 'class-validator';

export class RunSqlDto {
  @IsString()
  @MaxLength(10000)
  sql: string;
}

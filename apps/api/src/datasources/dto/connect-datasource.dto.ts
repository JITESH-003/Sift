import { IsString, MaxLength } from 'class-validator';

export class ConnectDataSourceDto {
  @IsString()
  @MaxLength(500)
  connectionString: string;
}

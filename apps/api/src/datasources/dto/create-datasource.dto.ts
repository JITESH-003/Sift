import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateDataSourceDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(63)
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: 'schema must be a valid identifier',
  })
  schema: string;
}

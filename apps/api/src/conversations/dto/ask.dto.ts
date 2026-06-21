import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  question: string;
}

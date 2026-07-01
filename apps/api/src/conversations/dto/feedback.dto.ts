import { IsIn } from 'class-validator';

export class FeedbackDto {
  @IsIn(['up', 'down'])
  vote: 'up' | 'down';
}

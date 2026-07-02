import { IsNumber, IsPositive } from 'class-validator';

// DTO para que un developer actualice la estimación de horas de su propia tarea
export class UpdateEstimateDto {
  @IsNumber()
  @IsPositive()
  estimatedHours: number;
}

import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

// DTO para la actualización parcial de un proyecto; todos los campos son opcionales.
// El campo status se omite intencionalmente: el estado solo se modifica
// via los endpoints /deactivate y /reactivate.
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

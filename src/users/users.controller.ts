import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserRole } from './users.entity';
import { UsersService } from './users.service';

// Todos los endpoints de este controlador requieren un JWT válido con rol ADMIN
@Controller('users')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // POST /users — crea un nuevo usuario
  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  // GET /users — lista todos los usuarios
  @Get()
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  // PATCH /users/:id/deactivate — desactiva la cuenta del usuario indicado
  @Patch(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() actor: User,
  ): Promise<UserResponseDto> {
    return this.usersService.deactivate(id, actor);
  }

  // PATCH /users/:id/reactivate — reactiva la cuenta de un usuario previamente desactivado
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.reactivate(id);
  }
}

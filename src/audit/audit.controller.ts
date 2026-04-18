import { Body, Controller } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Auditoria')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  async executeAudit(@Body() body: { calId: number }) {
    const erroresLey = await this.auditService.getValidadorLegal(body.calId);
    const variaciones = await this.auditService.getDataSueldos(body.calId);
    return { status: 'succes', data: { erroresLey, variaciones } };
  }
}

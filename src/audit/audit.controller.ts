import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuditService, PayrollAuditResult, AuditIncidency } from './audit.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DatabaseService } from '../common/database/database.service';
import { AuditPayrollDto, GenerateReportDto } from './dto/audit.dto';

@ApiTags('Auditoria')
@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly db: DatabaseService,
  ) {}

  @Get('calendars')
  @ApiOperation({ summary: 'Obtener calendarios disponibles' })
  async getCalendars(@Query('type') type: string): Promise<any[]> {
    let query = '';
    if (type === 'retroactivo') {
      query = `
        SELECT 
            cal_id, cal_num_periodo, cal_ano,
            TO_CHAR(cal_fcha_ini, 'YYYY-MM-DD 00:00:00') AS fecha_inicio,
            TO_CHAR(cal_fcha_fin, 'YYYY-MM-DD 23:59:59') AS fecha_fin
        FROM "SIAN2022".calendario_pro
        WHERE cal_estado = 'A' AND cal_num_periodo = 99
        ORDER BY cal_id DESC LIMIT 10;`;
    } else {
      query = `
        SELECT 
            cal_id, cal_num_periodo, cal_ano,
            TO_CHAR(cal_fcha_ini, 'YYYY-MM-DD 00:00:00') AS fecha_inicio,
            TO_CHAR((date_trunc('month', cal_fcha_ini) + interval '1 month - 1 day'), 'YYYY-MM-DD 23:59:59') AS fecha_fin
        FROM "SIAN2022".calendario_pro
        WHERE cal_estado = 'A'
        ORDER BY cal_id DESC LIMIT 10;`;
    }
    const { rows } = await this.db.query(query);
    return rows;
  }

  @Post('payroll')
  @ApiOperation({ summary: 'Auditoría de Nómina (SIAN)' })
  async auditPayroll(
    @Body() body: AuditPayrollDto,
  ): Promise<{ status: string; total_incidencias: number; data: PayrollAuditResult[] }> {
    const { calId, fInicio, fFin } = body;
    const erroresLey = await this.auditService.getValidadorLegal(calId);
    const variaciones = await this.auditService.getDataSueldos(calId);
    const novedades = await this.auditService.getNovedades(calId, fInicio, fFin);

    const allData = [...erroresLey, ...variaciones, ...novedades];
    const contextIA = await this.auditService.getContextIA(
      allData,
      calId,
      fInicio,
      fFin,
    );

    return {
      status: 'success',
      total_incidencias: allData.length,
      data: contextIA,
    };
  }

  @Post('retroactive')
  @ApiOperation({ summary: 'Auditoría de Retroactivo' })
  async auditRetroactive(
    @Body() body: AuditPayrollDto,
  ): Promise<{ status: string; data: AuditIncidency[] }> {
    const { calId, fInicio, fFin } = body;
    const errores = await this.auditService.getRetroactivo(calId, fInicio, fFin);
    return { status: 'success', data: errores };
  }

  @Post('report')
  @ApiOperation({ summary: 'Generar informe de IA para un empleado' })
  async generateReport(@Body() body: GenerateReportDto): Promise<{ status: string; report: string }> {
    const report = await this.auditService.generateAuditReport(body.empleadoData);
    return { status: 'success', report };
  }
}

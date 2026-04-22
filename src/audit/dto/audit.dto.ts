import { ApiProperty } from '@nestjs/swagger';

export class AuditPayrollDto {
  @ApiProperty({ description: 'Esquema de la base de datos del cliente' })
  schema: string;

  @ApiProperty({ description: 'ID del calendario a auditar' })
  calId: number;

  @ApiProperty({ description: 'Fecha de inicio del periodo' })
  fInicio: string;

  @ApiProperty({ description: 'Fecha de fin del periodo' })
  fFin: string;
}

export class GenerateReportDto {
  @ApiProperty({ description: 'Datos del empleado para generar el reporte' })
  empleadoData: any;
}

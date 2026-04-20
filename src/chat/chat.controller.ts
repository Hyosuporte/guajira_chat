import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  Param,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import type { Response } from 'express';
import { ChatToolsService } from './chat-tools.service';
import { DatabaseService } from '../common/database/database.service';
import * as XlsxPopulate from 'xlsx-populate';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatToolsService: ChatToolsService,
    private readonly db: DatabaseService,
  ) {}

  @Post()
  async chat(@Body('messages') messages: any[], @Res() res: Response) {
    const result = await this.chatService.processMessage(messages);
    result.pipeUIMessageStreamToResponse(res);
  }

  @Get('download-excel/:excelId')
  async downloadExcel(@Param('excelId') excelId: string, @Res() res: Response) {
    const cached = this.chatToolsService.excelCache.get(excelId);

    if (!cached) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .send('Reporte no encontrado o expirado.');
    }

    try {
      const { query } = cached;
      const data = await this.db.query(query);
      const rows = data.rows;
      const fields = data.fields;

      if (rows.length === 0) {
        return res
          .status(HttpStatus.NOT_FOUND)
          .send('No se encontraron datos para el reporte.');
      }

      const workbook = await XlsxPopulate.fromBlankAsync();
      const sheet = workbook.sheet(0);

      const headers = fields.map((field: any) => field.name);
      sheet.row(1).cell(1).value([headers]);

      rows.forEach((row: any, rowIndex: number) => {
        const rowData = fields.map((field: any) => row[field.name]);
        sheet
          .row(rowIndex + 2)
          .cell(1)
          .value([rowData]);
      });

      const excelBuffer = await workbook.outputAsync();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=' + `report_${excelId}.xlsx`,
      );
      res.send(excelBuffer);
    } catch (e: any) {
      console.error('Error generando o enviando Excel:', e);
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send(`Error interno al generar el reporte: ${e.message}`);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  private readonly CONSTANTES_LEY = {};

  async getValidadorLegal(calId: number) {
    const querySubsidios = 'sian.ts';
    const { rows } = await this.db.query(querySubsidios, [calId]);
  }

  async getDataSueldos(calIdActual: number) {
    const query = `sian.ts`;
    const { rows } = await this.db.query(query, [calIdActual]);
    //Logica comparacion sueldos
  }
}

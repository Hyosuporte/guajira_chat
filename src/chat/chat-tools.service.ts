import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { DatabaseService } from '../common/database/database.service';
import { EmbeddingsService, ViewEmbedding } from '../embeddings/embeddings.service';
import { LRUCache } from 'lru-cache';
import { randomUUID } from 'crypto';

export interface ExcelReportResponse {
  type: string;
  excelId: string;
  fileName: string;
  title: string;
  recordCount: number;
  preview: any[];
  columns: string[];
}

@Injectable()
export class ChatToolsService {
  private cacheQuery = new LRUCache<string, any>({
    max: 100,
    ttl: 1000 * 60 * 5,
  });

  public excelCache = new LRUCache<
    string,
    { query: string; data: any[]; headers: string[] }
  >({
    max: 50,
    ttl: 1000 * 60 * 5,
  });

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  getTools() {
    return {
      searchDatabaseViews: tool({
        description:
          'Realiza una búsqueda semántica para encontrar las vistas de base de datos más relevantes basadas en la intención del usuario. Útil para entender qué tablas o vistas consultar antes de generar SQL.',
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              'Texto descriptivo o palabras clave sobre la información que se busca (ej: "radicados por sigla ENT", "los radicados pqr").',
            ),
        }),
        execute: async ({ query }): Promise<ViewEmbedding[] | { error: string; detail: string }> => {
          try {
            const cacheKey = `emb_${query}`;
            let embedding: number[];

            if (this.cacheQuery.has(cacheKey)) {
              embedding = this.cacheQuery.get(cacheKey) as number[];
            } else {
              embedding = await this.embeddingsService.embedSentence(query);
              this.cacheQuery.set(cacheKey, embedding);
            }

            const context = await this.embeddingsService.search(embedding);
            return context;
          } catch (e: any) {
            return {
              error: 'Error al buscar vistas de base de datos',
              detail: e.message,
            };
          }
        },
      }),

      runGenerateSQLQuery: tool({
        description:
          'Ejecuta una consulta SQL de tipo SELECT en la base de datos. IMPORTANTE: La consulta NO debe contener punto y coma (;) al final ni clausulas LIMIT/OFFSET manuales, ya que esta herramienta aplicará la paginación automáticamente. Úsala solo cuando el usuario haya confirmado la ejecución.',
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              'La consulta SQL SELECT pura, sin punto y coma final (;) y sin LIMIT/OFFSET.',
            ),
          offset: z
            .number()
            .default(0)
            .describe('Número de filas a saltar (paginación).'),
          limit: z
            .number()
            .default(10)
            .describe('Número máximo de filas a retornar.'),
        }),
        execute: async ({ query, limit = 5, offset = 0 }) => {
          if (
            !query.trim().toLowerCase().startsWith('select') ||
            this.isDangerousQuery(query)
          ) {
            return { error: 'Solo se permiten consultas SELECT' };
          }

          try {
            const cacheKey = `${query}_${limit}_${offset}`;
            if (this.cacheQuery.has(cacheKey)) {
              return this.cacheQuery.get(cacheKey);
            }

            await this.db.query('SET statement_timeout TO 0');
            const sql = `${query} LIMIT ${limit} OFFSET ${offset}`;
            const data = await this.db.query(sql);

            const resultWrapper = {
              data: data.rows,
              count: data.rows.length,
              summary: `Se encontraron ${data.rows.length} registros.`,
            };

            this.cacheQuery.set(cacheKey, resultWrapper);
            return resultWrapper;
          } catch (e: any) {
            return { error: 'Error ejecutando la consulta', detail: e.message };
          }
        },
      }),

      generateToExcel: tool({
        description:
          'Ejecuta la consulta SQL para generar un informe en Excel. La consulta debe incluir filtros de fecha cuando sea relevante.',
        inputSchema: z.object({
          query: z.string().describe('Query SQL para obtener los datos del informe'),
          reportTitle: z
            .string()
            .default('Informe')
            .describe('Título descriptivo del reporte'),
        }),
        execute: async ({ query, reportTitle = 'Informe' }): Promise<ExcelReportResponse | { error: string; detail?: string }> => {
          if (
            !query.trim().toLowerCase().startsWith('select') ||
            this.isDangerousQuery(query)
          ) {
            return { error: 'Solo se permiten consultas SELECT' };
          }

          try {
            const data = await this.db.query(query);
            const headers = data.fields.map((item: any) => item.name);
            const excelId = randomUUID();

            this.excelCache.set(excelId, { query, data: data.rows, headers });

            return {
              type: 'excel_report',
              excelId: excelId,
              fileName: `${reportTitle.replace(/[^a-z0-9]/gi, '_')}.xlsx`,
              title: reportTitle,
              recordCount: data.rows.length,
              preview: data.rows.slice(0, 5),
              columns: headers,
            };
          } catch (e: any) {
            return {
              error: 'Error generando el informe Excel',
              detail: e.message,
            };
          }
        },
      }),
    };
  }

  private isDangerousQuery(query: string): boolean {
    const lower = query.toLowerCase();
    return (
      lower.includes('drop') ||
      lower.includes('delete') ||
      lower.includes('insert') ||
      lower.includes('update') ||
      lower.includes('alter') ||
      lower.includes('truncate') ||
      lower.includes('create') ||
      lower.includes('grant') ||
      lower.includes('revoke')
    );
  }
}

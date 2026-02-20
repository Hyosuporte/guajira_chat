/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from 'ai';
import { z } from 'zod';
import OpenAI from 'openai';
const Openai = new OpenAI();
/* import { LRUCache } from 'lru-cache';
import { QueryArrayResult } from 'pg';
import { randomUUID } from 'crypto'; */

const fileSearchTool = tool({
  description:
    'Busca SIEMPRE en los documentos cargados cuando el usuario pregunte sobre Smartsoft y usarlos para redactar una respuesta',

  inputSchema: z.object({
    query: z.string(),
  }),

  execute: async ({ query }) => {
    const response = await Openai.vectorStores.search(
      process.env.VECTOR_STORE_ID!,
      { query, max_num_results: 3 },
    );

    const snippets = response.data
      .map((doc: any) => doc.content?.[0].text.trim() || '')
      .join('\n');

    return snippets;
  },
});

const fileSearchToolGua = tool({
  description:
    'Busca SIEMPRE en los documentos cargados cuando el usuario pregunte sobre Grupo guajira y usarlos para redactar una respuesta',

  inputSchema: z.object({
    query: z.string(),
  }),

  execute: async ({ query }) => {
    const response = await Openai.vectorStores.search(
      process.env.VECTOR_STORE_ID_GUA!,
      { query, max_num_results: 3 },
    );

    const snippets = response.data
      .map((doc: any) => doc.content?.[0].text.trim() || '')
      .join('\n');

    return snippets;
  },
});

/* const cacheQuery = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 10,
});
 */

/* const excelCache = new LRUCache<
  string,
  { query: string; data: any[]; headers: string[] }
>({
  max: 50,
  ttl: 1000 * 60 * 10, // 5 minutos
<<<<<<< HEAD
}); */

/* const searchDatabaseViews = tool({
});

const searchDatabaseViews = tool({
  description:
    'Realiza una búsqueda semántica para encontrar las vistas de base de datos más relevantes basadas en la intención del usuario. Útil para entender qué tablas o vistas consultar antes de generar SQL.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'Texto descriptivo o palabras clave sobre la información que se busca (ej: "radicados por sigla ENT", "los radicados pqr").',
      ),
  }),
  execute: async ({ query }) => {
    try {
      const cacheKey = `emb_${query}`;
      let embedding: any;

      if (cacheQuery.has(cacheKey)) {
        console.log('Embedding desde caché');
        embedding = cacheQuery.get(cacheKey);
      } else {
        embedding = await embedSentence(query);
        cacheQuery.set(cacheKey, embedding);
      }

      const context = await search(embedding);

      return context;
    } catch (e: any) {
      console.log('Error en searchDatabaseViews:', e);
      return {
        error: 'Error al buscar vistas de base de datos',
        detail: e.message,
      };
    }
  },
});

const runGenerateSQLQuery = tool({
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
      query.trim().toLowerCase().includes('drop') ||
      query.trim().toLowerCase().includes('delete') ||
      query.trim().toLowerCase().includes('insert') ||
      query.trim().toLowerCase().includes('update') ||
      query.trim().toLowerCase().includes('alter') ||
      query.trim().toLowerCase().includes('truncate') ||
      query.trim().toLowerCase().includes('create') ||
      query.trim().toLowerCase().includes('grant') ||
      query.trim().toLowerCase().includes('revoke')
    ) {
      return { error: 'Solo se permiten consultas SELECT' };
    }

    let data: any;

    try {
      const cacheKey = `${query}_${limit}_${offset}`;
      if (cacheQuery.has(cacheKey)) {
        return cacheQuery.get(cacheKey);
      }

      await pool.query('SET statement_timeout TO 0');
      console.log(`${query} LIMIT ${limit} OFFSET ${offset}`);
      data = await pool.query(`${query} LIMIT ${limit} OFFSET ${offset}`);

      const safeRows = JSON.parse(JSON.stringify(data.rows));

      const resultWrapper = {
        data: safeRows,
        count: safeRows.length,
        summary: `Se encontraron ${safeRows.length} registros.`,
      };

      cacheQuery.set(cacheKey, resultWrapper);
      return resultWrapper;
    } catch (e: any) {
      console.log(e);
      return { error: 'Error ejecutando la consulta', detail: e.message };
    }
  },
});

const generateToExcel = tool({
  description:
    'Ejecuta la consulta SQL para generar un informe en Excel. La consulta debe incluir filtros de fecha cuando sea relevante.',
  inputSchema: z.object({
    query: z.string().describe('Query SQL para obtener los datos del informe'),
    reportTitle: z
      .string()
      .default('Informe')
      .describe('Título descriptivo del reporte'),
  }),
  execute: async ({ query, reportTitle = 'Informe' }) => {
    if (
      !query.trim().toLowerCase().startsWith('select') ||
      query.trim().toLowerCase().includes('drop') ||
      query.trim().toLowerCase().includes('delete') ||
      query.trim().toLowerCase().includes('insert') ||
      query.trim().toLowerCase().includes('update') ||
      query.trim().toLowerCase().includes('alter') ||
      query.trim().toLowerCase().includes('truncate') ||
      query.trim().toLowerCase().includes('create') ||
      query.trim().toLowerCase().includes('grant') ||
      query.trim().toLowerCase().includes('revoke')
    ) {
      return JSON.stringify({ error: 'Solo se permiten consultas SELECT' });
    }

    try {
      const data: QueryArrayResult = await pool.query(query);

      const headers = data.fields.map((item: any) => item.name);

      const excelId = randomUUID();
      excelCache.set(excelId, { query, data: data.rows, headers });

      const response = {
        type: 'excel_report',
        excelId: excelId,
        fileName: `${reportTitle.replace(/[^a-z0-9]/gi, '_')}.xlsx`,
        title: reportTitle,
        recordCount: data.rows.length,
        preview: data.rows.slice(0, 5),
        columns: headers,
      };

      return response;
    } catch (e: any) {
      console.error('Error generando Excel:', e);
      return {
        error: 'Error generando el informe Excel',
        detail: e.message,
      };
    }
  },
}); */

export {
  fileSearchTool,
  fileSearchToolGua,
  /*   searchDatabaseViews,
  runGenerateSQLQuery,
  generateToExcel,
  excelCache, */
};

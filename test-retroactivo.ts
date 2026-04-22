import 'dotenv/config';
import * as http from 'http';
import * as readline from 'readline';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const API_HOST = 'localhost';
const API_PORT = 3000;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

function request(options: http.RequestOptions, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTest() {
  console.log('--- Probador de Auditoría de Retroactivos ---');

  try {
    console.log('\nCargando bases de datos de clientes...');
    const schemas = await request({
      host: API_HOST,
      port: API_PORT,
      path: '/audit/schemas',
      method: 'GET',
    });

    if (!Array.isArray(schemas) || schemas.length === 0) {
      console.log('No se encontraron bases de datos de clientes.');
      rl.close();
      return;
    }

    console.log('\nBases de Datos de Clientes Disponibles:');
    schemas.forEach((schema: string, index: number) => {
      console.log(`${index + 1}. ${schema}`);
    });

    const schemaChoice = await question('\nSeleccione un cliente: ');
    const selectedSchemaIdx = parseInt(schemaChoice) - 1;

    if (isNaN(selectedSchemaIdx) || !schemas[selectedSchemaIdx]) {
      console.log('Selección inválida.');
      rl.close();
      return;
    }

    const selectedSchema = schemas[selectedSchemaIdx];

    console.log(`\nCargando calendarios para ${selectedSchema}...`);
    const calendars = await request({
      host: API_HOST,
      port: API_PORT,
      path: `/audit/calendars?type=retroactivo&schema=${selectedSchema}`,
      method: 'GET',
    });

    if (!Array.isArray(calendars) || calendars.length === 0) {
      console.log('No se encontraron calendarios para este cliente.');
      rl.close();
      return;
    }

    console.log('\nCalendarios Disponibles:');
    calendars.forEach((cal: any, index: number) => {
      console.log(
        `${index + 1}. ID: ${cal.cal_id} | Periodo: ${cal.cal_num_periodo} | Año: ${cal.cal_ano} | Rango: ${cal.fecha_inicio} - ${cal.fecha_fin}`,
      );
    });

    const choice = await question('\nSeleccione un número de la lista: ');
    const selectedIdx = parseInt(choice) - 1;

    if (isNaN(selectedIdx) || !calendars[selectedIdx]) {
      console.log('Selección inválida.');
      rl.close();
      return;
    }

    const selectedCal = calendars[selectedIdx];

    console.log(
      `\nEjecutando auditoría para el calendario ${selectedCal.cal_id} en ${selectedSchema}...`,
    );
    const auditResponse = await request(
      {
        host: API_HOST,
        port: API_PORT,
        path: '/audit/retroactive',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        schema: selectedSchema,
        calId: selectedCal.cal_id,
        fInicio: selectedCal.fecha_inicio,
        fFin: selectedCal.fecha_fin,
      },
    );

    const incidencias = auditResponse.data;

    if (!incidencias || incidencias.length === 0) {
      console.log('\nNo se detectaron errores en los retroactivos.');
    } else {
      console.log(
        `\nSe detectaron ${incidencias.length} incidencias en total.`,
      );

      const dataAgrupada = Object.values(
        incidencias.reduce((acc: any, curr: any) => {
          const cedula =
            curr.informacionBase.emp_cedula ||
            curr.informacionBase.cedula_empleado;
          if (!acc[cedula]) {
            acc[cedula] = {
              cedula_empleado: cedula,
              incidencias_encontradas: [],
            };
          }
          acc[cedula].incidencias_encontradas.push(curr);
          return acc;
        }, {}),
      );

      const empleadosPrueba = dataAgrupada.slice(0, 10);

      console.log(
        `\n=== GENERANDO REPORTES DE IA (Primeros ${empleadosPrueba.length} empleados) ===\n`,
      );

      for (const empleado of empleadosPrueba) {
        try {
          const { text } = await generateText({
            model: openai('o3-mini'),
            system: `Eres un auditor experto en liquidación de RETROACTIVOS de nómina del sector público en Colombia.
                    INSTRUCCIONES CRÍTICAS DE AUDITORÍA:
                    1. CERO CÁLCULOS PROPIOS: NO HAGAS CÁLCULOS MATEMÁTICOS POR TU CUENTA. El sistema automatizado (TypeScript) ya cruzó las bases de datos y realizó las validaciones exactas. Tu única labor es interpretar los resultados del JSON y redactar el informe, no recalcularlos.
                    2. CONTEXTO DE LAS BASES (REGLA DE LEY 100):
                        - El "retro_pagado_total" incluye TODOS los conceptos pagados (salariales y primas/bonificaciones no salariales). Todo este dinero recibe el aumento por decreto.
                        - El "retro_pagado_ley100" es una base MENOR. Contiene SOLO los conceptos puramente salariales. Esta es la ÚNICA base sobre la cual el sistema calcula el descuento del 4% de Salud y 4% de Pensión. Entiende que es correcto que la salud no se cobre sobre el total bruto.
                    3. TU TAREA: Lee exclusivamente los campos "detalle", "alerta" y "tipo_descuadre" de las incidencias en el JSON proporcionado. Basado estrictamente en los textos y números de esos campos, redacta un informe profesional y unificado sobre la situación del empleado.
                    4. LENGUAJE NATURAL Y GERENCIAL: NUNCA uses ni menciones los nombres de las variables técnicas ni los códigos internos del JSON de forma literal (por ejemplo, está ESTRICTAMENTE PROHIBIDO escribir "tipo_descuadre", "ERROR_CALCULO_RETROACTIVO", "ERROR_SALUD_RETROACTIVO" o "REVISION_MANUAL_VACACIONES"). Traduce esos conceptos a lenguaje natural. Di "Se identificó una inconsistencia en el cobro de salud" o "Se detectó una alerta informativa por vacaciones".
                    5. MANEJO DE VACACIONES: Si detectas internamente el caso de revisión manual por vacaciones, redacta el informe indicando directamente que es una "Alerta Informativa por Vacaciones Cruzadas / Doceavas". Explica que la diferencia en el 7% se debe a vacaciones pagadas por adelantado en otros años y que requiere revisión visual del auditor humano. Aclara que no es una evasión.
                    6. PRECISIÓN: Siempre menciona los valores exactos en pesos ($) tal como vienen redactados en el campo "detalle".
                    7. REGLA DE IDENTIFICACIÓN OBLIGATORIA: Es absolutamente obligatorio que extraigas la cédula del empleado del JSON proporcionado
                    FORMATO DE SALIDA: TEXTO PLANO. Un solo párrafo fluido, directo y formal.
                    SIEMPRE DEBES INICIAR TU RESPUESTA EXACTAMENTE CON ESTA FRASE: "Empleado con cédula [aquí la cédula]: " y luego continuas con el informe.
                    NO USES NEGRITAS, ASTERISCOS NI MARKDOWN.`,
            prompt:
              'Error detectado en el Retroactivo:\n' +
              JSON.stringify(empleado, null, 2),
          });

          console.log(
            '\n------------------------------------------------------------',
          );
          console.log(text);
          console.log(
            '------------------------------------------------------------\n',
          );
        } catch (aiError: any) {
          console.error(`Error al generar reporte: ${aiError.message}`);
        }
      }
    }
  } catch (error: any) {
    console.error('\nError durante la prueba:', error.message);
  } finally {
    rl.close();
  }
}

runTest();

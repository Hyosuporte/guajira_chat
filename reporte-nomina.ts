import 'dotenv/config';
import * as http from 'http';
import * as fs from 'fs';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const API_HOST = 'localhost';
const API_PORT = 3000;
const REPORT_FILE = 'informe de salida de AI Nomina.txt';

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

function writeToReport(text: string) {
  console.log(text);
  fs.appendFileSync(REPORT_FILE, text + '\n');
}

async function runAllTests() {
  if (fs.existsSync(REPORT_FILE)) {
    fs.unlinkSync(REPORT_FILE);
  }

  writeToReport('--- INFORME DE SALIDA DE AI - AUDITORÍA DE NÓMINA ---');
  writeToReport(`Fecha: ${new Date().toLocaleString()}`);
  writeToReport('------------------------------------------------------------\n');

  try {
    const schemas = await request({
      host: API_HOST,
      port: API_PORT,
      path: '/audit/schemas',
      method: 'GET',
    });

    if (!Array.isArray(schemas) || schemas.length === 0) {
      writeToReport('No se encontraron bases de datos de clientes.');
      return;
    }

    for (const schema of schemas) {
      writeToReport(`\n>>> PROCESANDO CLIENTE: ${schema}`);
      
      const calendars = await request({
        host: API_HOST,
        port: API_PORT,
        path: `/audit/calendars?type=nomina&schema=${schema}`,
        method: 'GET',
      });

      if (!Array.isArray(calendars) || calendars.length === 0) {
        writeToReport(`No se encontraron calendarios para el cliente ${schema}.`);
        continue;
      }

      // Filtrar normales (no retroactivos)
      const normalCalendars = calendars.filter((cal: any) => String(cal.cal_num_periodo) !== '99');

      if (normalCalendars.length === 0) {
        writeToReport(`No se encontraron calendarios normales para el cliente ${schema}.`);
        continue;
      }

      let selectedCal;
      // Usar la segunda opción si existe, sino la primera
      if (normalCalendars.length >= 2) {
        selectedCal = normalCalendars[1];
        writeToReport(`Usando opción 2 (ID: ${selectedCal.cal_id})`);
      } else {
        selectedCal = normalCalendars[0];
        writeToReport(`Usando única opción disponible (ID: ${selectedCal.cal_id})`);
      }

      writeToReport(`Ejecutando auditoría de nómina para el calendario ${selectedCal.cal_id} | Periodo: ${selectedCal.cal_num_periodo} | Año: ${selectedCal.cal_ano}`);

      const auditResponse = await request(
        {
          host: API_HOST,
          port: API_PORT,
          path: '/audit/payroll',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        {
          schema: schema,
          calId: selectedCal.cal_id,
          fInicio: selectedCal.fecha_inicio,
          fFin: selectedCal.fecha_fin,
        },
      );

      const incidencias = auditResponse.data;

      if (!incidencias || incidencias.length === 0) {
        writeToReport('No se detectaron errores en la nómina para este cliente.');
      } else {
        writeToReport(`Se detectaron ${incidencias.length} incidencias en total.`);

        const empleadosPrueba = incidencias.slice(0, 30);
        writeToReport(`Generando reportes de IA para los primeros ${empleadosPrueba.length} empleados...\n`);

        for (const empleado of empleadosPrueba) {
          try {
            const { text } = await generateText({
              model: openai('o3-mini'),
              system: `Eres un experto auditor de nómina senior en Colombia. Tu objetivo es analizar variaciones salariales comparando el mes actual con el anterior, así como el cumplimiento de la normatividad legal. 
        
                    REGLAS DE AUDITORÍA CRÍTICAS:
                    1. LEY 100 (Vacaciones): Si en 'OTRO_CONCEPTO_DETECTADO' o 'VARIACION_DIAS' ves que las deducciones (Salud 7200, Pensión 5200) son MÁS ALTAS que el mes pasado, y el empleado tiene un concepto de vacaciones (Ej. 1100, 1101), es CORRECTO.
                    2. INTERVENCIÓN MANUAL: Si en 'extraData' ves 'ALERTA_INVERVENCION_MANUAL', debes ADVERTIRLO fuertemente. Un humano alteró la nómina.
                    3. AUMENTO SALARIAL: Si el caso es 'CAMBIO_SUELDO_BASE', verifica las tarifas. NUNCA confundas el 'sueldo_actual' (que es el dinero neto en el bolsillo) con el 'valor_base_actual' (que es el salario del Sueldo).
                    4. OMISIONES: Si el tipo_descuadre es PRESTAMO_OMITIDO, LICENCIA_OMITIDA, PRIMA_OMITIDA o APORTE_VOLUNTARIO_OMITIDO, es un error gravísimo del sistema que debe reportarse.
                    5. NOMBRES Y VALORES EXACTOS: Siempre debes mencionar explícitamente el NOMBRE, el CÓDIGO numérico y el VALOR EXACTO en dinero de TODOS los conceptos implicados. NUNCA menciones un concepto sin decir cuánto dinero representa.
                    6. SINDICATOS VS PRÉSTAMOS: Si el error es 'PRESTAMO_OMITIDO', lee el nombre del concepto. Si contiene palabras como "Sindicato", "Sintra" o "Cuota Sindical", repórtalo como una "ALERTA SINDICAL CRÍTICA".
                    7. SUBSIDIOS DE LEY (Transporte/Alimentación): Si el error es sobre límites legales de subsidios, sé muy claro sobre las reglas (proporcionalidad de días o tope de 2 SMMLV) que el liquidador violó.
                    8. FONDO DE SOLIDARIDAD (6200): Si notas que al empleado se le descontó el concepto 6200, PERO su base salarial es inferior a los 4 SMMLV, denúncialo inmediatamente como un DESCUENTO ILEGAL INDEBIDO, sin importar qué tipo de descuadre estés evaluando.
            
                    Analiza el JSON, cruza los datos de 'informacionBase' con 'extraData' y genera una conclusión breve, directa y profesional por cada empleado explicando exactamente por qué le llegó más o menos dinero, o qué error se cometió.
                    
                    FORMATO DE SALIDA: TEXTO PLANO. Cada empleado separado por una línea blanca. NO USES NEGRITAS, ASTERISCOS NI MARKDOWN.`,
              prompt:
                'Lista de descuadres encontrados en la nómina para auditar:\n' +
                JSON.stringify(empleado, null, 2),
            });

            writeToReport('------------------------------------------------------------');
            writeToReport(text);
            writeToReport('------------------------------------------------------------\n');
          } catch (aiError: any) {
            writeToReport(`Error al generar reporte para empleado: ${aiError.message}`);
          }
        }
      }
    }
    writeToReport('\n--- FIN DEL INFORME ---');
  } catch (error: any) {
    writeToReport(`\nError crítico durante la ejecución: ${error.message}`);
  }
}

runAllTests();

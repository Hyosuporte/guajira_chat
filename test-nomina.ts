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
  console.log('--- Sistema de Auditoría de Nómina con IA ---');

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

    console.log(`\nCargando calendarios activos para ${selectedSchema}...`);
    // Usamos type=nomina o simplemente sin type para que entre en el else del controller
    const calendars = await request({
      host: API_HOST,
      port: API_PORT,
      path: `/audit/calendars?type=nomina&schema=${selectedSchema}`,
      method: 'GET',
    });

    if (!Array.isArray(calendars) || calendars.length === 0) {
      console.log('No se encontraron calendarios activos para este cliente.');
      rl.close();
      return;
    }

    // Filtrar para excluir calendarios de retroactivo (periodo 99)
    const normalCalendars = calendars.filter((cal: any) => String(cal.cal_num_periodo) !== '99');

    if (normalCalendars.length === 0) {
      console.log('No se encontraron calendarios normales activos (no retroactivos) para este cliente.');
      rl.close();
      return;
    }

    console.log('\nCalendarios Disponibles:');
    normalCalendars.forEach((cal: any, index: number) => {
      console.log(
        `${index + 1}. ID: ${cal.cal_id} | Periodo: ${cal.cal_num_periodo} | Año: ${cal.cal_ano} | Rango: ${cal.fecha_inicio} - ${cal.fecha_fin}`,
      );
    });

    const choice = await question('\nSeleccione un número de la lista: ');
    const selectedIdx = parseInt(choice) - 1;

    if (isNaN(selectedIdx) || !normalCalendars[selectedIdx]) {
      console.log('Selección inválida.');
      rl.close();
      return;
    }

    const selectedCal = normalCalendars[selectedIdx];

    console.log(
      `\nEjecutando auditoría de nómina para el calendario ${selectedCal.cal_id} en ${selectedSchema}...`,
    );
    const auditResponse = await request(
      {
        host: API_HOST,
        port: API_PORT,
        path: '/audit/payroll',
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
      console.log('\nNo se detectaron errores en la nómina.');
    } else {
      console.log(
        `\nSe detectaron ${incidencias.length} incidencias en total.`,
      );

      const empleadosPrueba = incidencias.slice(0, 30);

      console.log(
        `\n=== GENERANDO REPORTES DE IA (Primeros ${empleadosPrueba.length} empleados) ===\n`,
      );

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
                    
                    FORMATO DE SALIDA: TEXTO PLANO. Cada empleado separado por una línea blanca o con separadores. NO USES NEGRITAS, ASTERISCOS NI MARKDOWN.`,
            prompt:
              'Lista de descuadres encontrados en la nómina para auditar:\n' +
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

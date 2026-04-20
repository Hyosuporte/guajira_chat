import * as http from 'http';
import * as readline from 'readline';

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
  console.log('--- Probador de Auditoría de Retroactivos (Sin dependencias) ---');

  try {
    // 1. Obtener calendarios
    console.log('\nCargando calendarios de retroactivo...');
    const calendars = await request({
      host: API_HOST,
      port: API_PORT,
      path: '/audit/calendars?type=retroactivo',
      method: 'GET',
    });

    if (!Array.isArray(calendars) || calendars.length === 0) {
      console.log('No se encontraron calendarios o el servidor no responde.');
      rl.close();
      return;
    }

    console.log('\nCalendarios Disponibles:');
    calendars.forEach((cal: any, index: number) => {
      console.log(`${index + 1}. ID: ${cal.cal_id} | Periodo: ${cal.cal_num_periodo} | Año: ${cal.cal_ano} | Rango: ${cal.fecha_inicio} - ${cal.fecha_fin}`);
    });

    const choice = await question('\nSeleccione un número de la lista: ');
    const selectedIdx = parseInt(choice) - 1;

    if (isNaN(selectedIdx) || !calendars[selectedIdx]) {
      console.log('Selección inválida.');
      rl.close();
      return;
    }

    const selectedCal = calendars[selectedIdx];

    // 2. Ejecutar auditoría
    console.log(`\nEjecutando auditoría para el calendario ${selectedCal.cal_id}...`);
    const auditResponse = await request({
      host: API_HOST,
      port: API_PORT,
      path: '/audit/retroactive',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      calId: selectedCal.cal_id,
      fInicio: selectedCal.fecha_inicio,
      fFin: selectedCal.fecha_fin,
    });

    const incidencias = auditResponse.data;

    if (!incidencias || incidencias.length === 0) {
      console.log('\nNo se detectaron errores en los retroactivos.');
    } else {
      console.log(`\nSe detectaron ${incidencias.length} inconsistencias:`);
      incidencias.slice(0, 5).forEach((err: any, index: number) => {
        console.log(`----------------------------------------`);
        console.log(`Hallazgo #${index + 1}`);
        console.log(`Empleado: ${err.emp_cedula || 'N/A'}`);
        console.log(`Tipo: ${err.tipo_descuadre}`);
        console.log(`Detalle: ${err.detalle}`);
      });
      if (incidencias.length > 5) console.log('... (más resultados omitidos)');
    }

  } catch (error: any) {
    console.error('\nError durante la prueba:', error.message);
  } finally {
    rl.close();
  }
}

runTest();

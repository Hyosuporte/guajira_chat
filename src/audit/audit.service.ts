// @ts-nocheck
import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface AuditIncidency {
  tipo_descuadre: string;
  detalle: string;
  emp_cedula?: string;
  cedula_empleado?: string;
  [key: string]: any;
}

export interface PayrollAuditResult {
  informacionBase: AuditIncidency;
  extraData: any;
}

@Injectable()
export class AuditService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  private readonly CONSTANTES_LEY = {
    SMMLV: 1750905,
    TOPE_TRANSPORTE: 3501810,
    TOPE_ALIMENTACION: 2774076,
    VALOR_TRANSPORTE: 249095,
    VALOR_ALIMENTACION: 98931,
  };

  async onModuleInit() {
    // Initialization depends on client, so it's handled per request
  }

  private async loadTopesFSP(clientKey: string): Promise<any[]> {
    const queryTopes = `SELECT * FROM tope_ley100`;
    const result = await this.db.query(queryTopes, [], clientKey);
    return result.rows;
  }

  private async loadDiccionario(
    clientKey: string,
  ): Promise<Record<number, string>> {
    const queryDiccionario = `SELECT con_codigo, con_nombre FROM concepto`;
    const result = await this.db.query(queryDiccionario, [], clientKey);
    const dic: Record<number, string> = {};
    for (const concepto of result.rows) {
      dic[concepto.con_codigo] = concepto.con_nombre;
    }
    return dic;
  }

  private obtenerPorcentajesFSP(topes: any[], ibc: number): number {
    for (const tope of topes) {
      const topeMin = Number(tope.valor_min);
      const topeMax = Number(tope.valor_max);
      const porcentaje = Number(tope.porc_descuento);

      if (ibc >= topeMin && ibc <= topeMax) {
        return porcentaje;
      }
    }
    return 0;
  }

  async getValidadorLegal(
    clientKey: string,
    calId: number,
  ): Promise<AuditIncidency[]> {
    const topesFSP = await this.loadTopesFSP(clientKey);
    const querySubsidios = `WITH ResumenMes AS (
        SELECT 
            emp_cedula,
            SUM(CASE WHEN con_codigo IN (100, 110, 800, 801, 810) THEN liq_valor_concepto ELSE 0 END) AS sueldo_base,
            MAX(CASE WHEN con_codigo IN (100, 110) THEN liq_dias_liquidados ELSE 0 END) AS dias_trabajados,
            SUM(CASE WHEN con_codigo IN (400, 401, 402) THEN liq_valor_concepto ELSE 0 END) AS total_alimentacion,
            SUM(CASE WHEN con_codigo IN (500, 501) THEN liq_valor_concepto ELSE 0 END) AS total_transporte,
            SUM(CASE WHEN con_codigo IN (7200, 7201) THEN liq_valor_concepto ELSE 0 END) AS salud_empleado,
            SUM(CASE WHEN con_codigo IN (5200, 5201, 5202) THEN liq_valor_concepto ELSE 0 END) AS pension_empleado,
            SUM(CASE WHEN con_codigo IN (6200) THEN liq_valor_concepto ELSE 0 END) AS fondo_solidaridad
        FROM conceliq
        WHERE cal_id = $1
        GROUP BY emp_cedula
    )
    SELECT * FROM ResumenMes WHERE sueldo_base > 0;`;

    const { rows } = await this.db.query(querySubsidios, [calId], clientKey);
    const erroresLey: AuditIncidency[] = [];

    for (const item of rows) {
      const dias = Number(item.dias_trabajados);
      const sueldoBase = Number(item.sueldo_base);
      const transportePagado = Number(item.total_transporte);
      const alimentacionPagada = Number(item.total_alimentacion);

      const topeTranspProporcional = Math.round(
        (this.CONSTANTES_LEY.VALOR_TRANSPORTE / 30) * dias,
      );
      const topeAlimProporcional = Math.round(
        (this.CONSTANTES_LEY.TOPE_ALIMENTACION / 30) * dias,
      );

      if (transportePagado > topeTranspProporcional) {
        erroresLey.push({
          tipo_descuadre: 'EXCESO_SUBSIDIO_TRANSPORTE',
          detalle: `Se le pagaron ${transportePagado}, pero al laborar ${dias} dias su tope maximo legal es ${topeTranspProporcional}`,
          ...item,
        });
      }

      if (
        sueldoBase >= this.CONSTANTES_LEY.TOPE_TRANSPORTE &&
        transportePagado > 0
      ) {
        erroresLey.push({
          tipo_descuadre: 'PAGO_INDEBIDO_TRANSPORTE',
          detalle: `El empleado devenga $${sueldoBase} (más de ${this.CONSTANTES_LEY.TOPE_TRANSPORTE} que es el tope), NO tiene derecho a auxilio de transporte pero se le pagaron $${transportePagado}.`,
          ...item,
        });
      }

      if (
        sueldoBase <= this.CONSTANTES_LEY.TOPE_TRANSPORTE &&
        transportePagado === 0 &&
        dias > 0
      ) {
        erroresLey.push({
          tipo_descuadre: 'OMISION_LEY_TRANSPORTE',
          detalle: `El empleado gana menos de ${this.CONSTANTES_LEY.TOPE_TRANSPORTE} ($${sueldoBase}). Trabajó ${dias} días y NO se le pagó auxilio de transporte. Riesgo de demanda.`,
          ...item,
        });
      }

      if (alimentacionPagada > topeAlimProporcional) {
        erroresLey.push({
          tipo_descuadre: 'EXCESO_SUBSIDIO_ALIMENTACION',
          detalle: `Se le pagaron $${alimentacionPagada}, pero al laborar ${dias} días su tope máximo legal es $${topeAlimProporcional}.`,
          ...item,
        });
      }

      if (
        sueldoBase > this.CONSTANTES_LEY.TOPE_ALIMENTACION &&
        alimentacionPagada > 0
      ) {
        erroresLey.push({
          tipo_descuadre: 'PAGO_INDEBIDO_ALIMENTACION',
          detalle: `El empleado devenga $${sueldoBase} (más de ${this.CONSTANTES_LEY.TOPE_ALIMENTACION} que es el tope), NO tiene derecho a auxilio de alimentacion pero se le pagaron $${alimentacionPagada}.`,
          ...item,
        });
      }

      if (dias === 30) {
        const saludEmpleado = Number(item.salud_empleado);
        const pensionEmpleado = Number(item.pension_empleado);
        const fondoSolidaridad = Number(item.fondo_solidaridad || 0);

        const ibcRedondeado = Math.round(sueldoBase / 1000) * 1000;
        const saludEsperadaEmp = Math.round((ibcRedondeado * 0.04) / 100) * 100;
        const pensionEsperadaEmp =
          Math.round((ibcRedondeado * 0.04) / 100) * 100;

        if (Math.abs(saludEmpleado - saludEsperadaEmp) > 150) {
          erroresLey.push({
            tipo_descuadre: 'ERROR_MATEMATICO_SALUD',
            detalle: `IBC redondeado al mil: $${ibcRedondeado} (Base original: $${sueldoBase}). El 4% de salud es $${saludEsperadaEmp}, pero se descontó $${saludEmpleado}.`,
            ...item,
          });
        }

        if (Math.abs(pensionEmpleado - pensionEsperadaEmp) > 150) {
          erroresLey.push({
            tipo_descuadre: 'ERROR_MATEMATICO_PENSION',
            detalle: `IBC redondeado al mil: $${ibcRedondeado} (Base original: $${sueldoBase}). El 4% de pensión es $${pensionEsperadaEmp}, pero se descontó $${pensionEmpleado}.`,
            ...item,
          });
        }

        const porcentajeLeyFSP = this.obtenerPorcentajesFSP(
          topesFSP,
          ibcRedondeado,
        );
        if (porcentajeLeyFSP > 0) {
          const fondoValor =
            Math.round((ibcRedondeado * porcentajeLeyFSP) / 100) * 100;
          if (fondoSolidaridad === 0) {
            erroresLey.push({
              tipo_descuadre: 'OMISION_FONDO_SOLIDARIDAD',
              detalle: `El IBC redondeado es $${ibcRedondeado}. Por ley aplica un descuento del ${(porcentajeLeyFSP * 100).toFixed(2)}%, pero no se descontó nada.`,
              ...item,
            });
          } else if (Math.abs(fondoSolidaridad - fondoValor) > 150) {
            erroresLey.push({
              tipo_descuadre: 'ERROR_MATEMATICO_FONDO',
              detalle: `El IBC redondeado es $${ibcRedondeado}. Aplica tarifa del ${(porcentajeLeyFSP * 100).toFixed(2)}% ($${fondoValor}), pero se descontaron $${fondoSolidaridad}.`,
              ...item,
            });
          }
        } else if (fondoSolidaridad > 0) {
          erroresLey.push({
            tipo_descuadre: 'DESCUENTO_INDEBIDO_FONDO',
            detalle: `El IBC redondeado es $${ibcRedondeado} (Menor a 4 SMMLV). NO aplica Fondo de Solidaridad, pero se le descontaron $${fondoSolidaridad}.`,
            ...item,
          });
        }
      }
    }
    return erroresLey;
  }

  async getDataSueldos(
    clientKey: string,
    calIdActual: number,
  ): Promise<AuditIncidency[]> {
    const queryComparacionSueldos = `
      WITH NominaActual AS (
          SELECT
              emp_cedula AS cedula_empleado,
              SUM(CASE WHEN liq_tipo_concepto = 1 THEN liq_valor_concepto ELSE 0 END) -
              SUM(CASE WHEN liq_tipo_concepto = 2 THEN liq_valor_concepto ELSE 0 END) AS sueldo_actual_neto,
              SUM(CASE WHEN con_codigo IN (100,110) THEN liq_valor_concepto ELSE 0 END) AS valor_base_actual,
              MAX(CASE WHEN con_codigo IN (100,110) THEN liq_dias_liquidados ELSE 0 END) AS dias_trabajados
          FROM conceliq
          GROUP BY emp_cedula
      ),
      HistoricoNomina AS (
          SELECT DISTINCT ON (historico.emp_cedula)
              historico.emp_cedula,
              historico.cal_id,
              MAX(CASE WHEN historico.con_codigo_concepto IN (100,110) THEN historico.acu_dias_trabajados ELSE 0 END) AS historico_dias
          FROM conceacu historico
          INNER JOIN calendario_pro cal ON historico.cal_id = cal.cal_id
          WHERE historico.emp_cedula IN (SELECT cedula_empleado FROM NominaActual)
              AND historico.cal_id < $1
              AND cal.cal_liq_definitiva = 'N'
          GROUP BY historico.emp_cedula, historico.cal_id
          ORDER BY historico.emp_cedula, historico.cal_id DESC
      ),
      HistoricoSueldoNeto AS (
          SELECT
              h.emp_cedula,
              h.historico_dias,
              SUM(CASE WHEN c.acu_tipo_concepto = 1 THEN c.acu_valor_concepto ELSE 0 END) -
              SUM(CASE WHEN c.acu_tipo_concepto = 2 THEN c.acu_valor_concepto ELSE 0 END) AS sueldo_anterior_neto,
              SUM(CASE WHEN c.con_codigo_concepto IN (100,110) THEN c.acu_valor_concepto ELSE 0 END) AS valor_base_anterior
          FROM HistoricoNomina h
          INNER JOIN conceacu c ON h.emp_cedula = c.emp_cedula AND h.cal_id = c.cal_id
          GROUP BY h.emp_cedula, h.historico_dias
      )
      SELECT
          actual.cedula_empleado,
          actual.dias_trabajados,
          actual.sueldo_actual_neto AS sueldo_actual,
          actual.valor_base_actual,
          historico.sueldo_anterior_neto AS sueldo_anterior,
          historico.valor_base_anterior,
          historico.historico_dias
      FROM NominaActual actual
      LEFT JOIN HistoricoSueldoNeto historico
      ON actual.cedula_empleado = historico.emp_cedula`;

    const { rows } = await this.db.query(
      queryComparacionSueldos,
      [calIdActual],
      clientKey,
    );
    const nominasInusuales: AuditIncidency[] = [];

    for (const item of rows) {
      if (item.sueldo_anterior === null) {
        nominasInusuales.push({ tipo_descuadre: 'NUEVO_INGRESO', ...item });
        continue;
      }
      if (item.dias_trabajados != 30) {
        nominasInusuales.push({ tipo_descuadre: 'VARIACION_DIAS', ...item });
        continue;
      }
      if (item.historico_dias != 30) {
        nominasInusuales.push({
          tipo_descuadre: 'NORMALIZACION_DIAS',
          detalle: `El mes pasado laboró ${item.historico_dias} días y este mes 30.`,
          ...item,
        });
        continue;
      }
      if (Number(item.valor_base_actual) != Number(item.valor_base_anterior)) {
        nominasInusuales.push({
          tipo_descuadre: 'CAMBIO_SUELDO_BASE',
          detalle: 'Cambió el valor del sueldo base.',
          ...item,
        });
        continue;
      }
      if (Number(item.sueldo_actual) != Number(item.sueldo_anterior)) {
        nominasInusuales.push({
          tipo_descuadre: 'OTRO_CONCEPTO_DETECTADO',
          detalle: 'Variación en el neto por otros conceptos.',
          ...item,
        });
        continue;
      }
    }
    return nominasInusuales;
  }

  async getNovedades(
    clientKey: string,
    calIdActual: number,
    fechaInicio: string,
    fechaFin: string,
  ): Promise<AuditIncidency[]> {
    const novedades: AuditIncidency[] = [];

    // Prestamos
    const queryPrestamos = `
    SELECT p.emp_cedula, p.codigo_descuento, p.pre_consecutivo
    FROM prestemp p
    WHERE p.pre_num_cuotas > 0 
      AND p.pre_saldo > 0 
      AND p.pre_estado_prestamo = 'A'
      AND EXISTS (
          SELECT 1 FROM conceliq c1 
          WHERE c1.cal_id = $1 AND c1.emp_cedula = p.emp_cedula
      )
      AND NOT EXISTS (
          SELECT 1 FROM conceliq c2 
          WHERE c2.cal_id = $1 
            AND c2.emp_cedula = p.emp_cedula 
            AND c2.con_codigo = p.codigo_descuento
            AND c2.con_consecutivo_prestamo = p.pre_consecutivo 
      );
    `;
    const prestamos = await this.db.query(
      queryPrestamos,
      [calIdActual],
      clientKey,
    );
    for (const p of prestamos.rows) {
      novedades.push({
        tipo_descuadre: 'PRESTAMO_OMITIDO',
        cedula_empleado: p.emp_cedula,
        codigo_concepto_omitido: p.codigo_descuento,
        detalle: `Préstamo activo omitido (Concepto: ${p.codigo_descuento})`,
      });
    }

    // Licencias
    const queryLicencias = `
        SELECT emp_cedula FROM licenemp
        WHERE le_fecha_inicio <= $3 
            AND le_fecha_final >= $2 
            AND emp_cedula IN (SELECT emp_cedula FROM conceliq WHERE cal_id = $1)
            AND emp_cedula NOT IN 
            (SELECT emp_cedula FROM conceliq WHERE cal_id = $1 AND con_codigo IN (0, 1, 4, 5, 11, 1600, 1602, 1800, 2000, 2005)
        );`;
    const licencias = await this.db.query(
      queryLicencias,
      [calIdActual, fechaInicio, fechaFin],
      clientKey,
    );
    for (const l of licencias.rows) {
      novedades.push({
        tipo_descuadre: 'LICENCIA_OMITIDA',
        cedula_empleado: l.emp_cedula,
        detalle: 'Licencia registrada que no fue descontada.',
      });
    }

    // Embargos
    const queryEmbargos = `
    SELECT e.emp_cedula, e.con_codigo
    FROM embargo e
    WHERE e.emb_estado = 'A'
        AND e.emp_cedula IN (SELECT emp_cedula FROM conceliq WHERE cal_id = $1)
        AND e.emp_cedula NOT IN (SELECT emp_cedula FROM conceliq WHERE cal_id = $1 AND con_codigo = e.con_codigo);
    `;
    const embargos = await this.db.query(
      queryEmbargos,
      [calIdActual],
      clientKey,
    );
    for (const e of embargos.rows) {
      novedades.push({
        tipo_descuadre: 'EMBARGO_OMITIDO',
        cedula_empleado: e.emp_cedula,
        codigo_concepto_embargo: e.con_codigo,
        detalle: 'Embargo omitido.',
      });
    }

    // Aportes Voluntarios
    const queryVoluntarios = `
    SELECT a.emp_cedula, a.con_codigo
    FROM aportes_adicionales_salpen a
    WHERE a.aportes_estado = 'A'
        AND a.emp_cedula IN (SELECT emp_cedula FROM conceliq WHERE cal_id = $1)
        AND a.emp_cedula NOT IN (SELECT emp_cedula FROM conceliq WHERE cal_id = $1 AND con_codigo = a.con_codigo);
    `;
    const aportes = await this.db.query(
      queryVoluntarios,
      [calIdActual],
      clientKey,
    );
    for (const a of aportes.rows) {
      novedades.push({
        tipo_descuadre: 'APORTE_VOLUNTARIO_OMITIDO',
        cedula_empleado: a.emp_cedula,
        codigo_concepto_aporte: a.con_codigo,
        detalle: 'Aporte voluntario omitido.',
      });
    }

    // Registros Manuales
    const queryManual = `SELECT DISTINCT emp_cedula FROM cmanual WHERE cal_id = $1;`;
    const manuales = await this.db.query(queryManual, [calIdActual], clientKey);
    for (const m of manuales.rows) {
      novedades.push({
        tipo_descuadre: 'REGISTRO_MANUAL',
        cedula_empleado: m.emp_cedula,
        detalle: 'Se detectó intervención manual en la nómina.',
      });
    }

    // Primas
    const queryPrimas = `
    SELECT p.emp_cedula, p.pri_codigo
    FROM prima_empleado p
    WHERE UPPER(p.pem_indica) = 'A'
        AND ((p.pem_fecha_ini <= $3 AND p.pem_fecha_fin >= $2) OR p.pem_fecha_fin IS NULL)
        AND p.emp_cedula IN (SELECT emp_cedula FROM conceliq WHERE cal_id = $1)
        AND p.emp_cedula NOT IN (SELECT emp_cedula FROM conceliq WHERE cal_id = $1 AND con_codigo = p.pri_codigo);
    `;
    const primas = await this.db.query(
      queryPrimas,
      [calIdActual, fechaInicio, fechaFin],
      clientKey,
    );
    for (const p of primas.rows) {
      novedades.push({
        tipo_descuadre: 'PRIMA_OMITIDA',
        cedula_empleado: p.emp_cedula,
        codigo_concepto_prima: p.pri_codigo,
        detalle: 'Prima omitida.',
      });
    }

    // Bonificacion
    const queryBonoIndebido = `
        SELECT liq.emp_cedula, e.emp_fecha_inicio_est, liq.liq_valor_concepto
        FROM conceliq liq
        JOIN empleado e ON liq.emp_cedula = e.emp_cedula
        WHERE liq.cal_id = $1 AND liq.con_codigo = 800
            AND (EXTRACT(MONTH FROM e.emp_fecha_inicio_est) != EXTRACT(MONTH FROM CAST($2 AS DATE))
               OR EXTRACT(YEAR FROM e.emp_fecha_inicio_est) >= EXTRACT(YEAR FROM CAST($2 AS DATE)));
    `;
    const bonosI = await this.db.query(
      queryBonoIndebido,
      [calIdActual, fechaInicio],
      clientKey,
    );
    for (const b of bonosI.rows) {
      novedades.push({
        tipo_descuadre: 'PAGO_INDEBIDO_BONO_SERVICIO',
        cedula_empleado: b.emp_cedula,
        detalle: `Cobró Bonificación (800) por $${b.liq_valor_concepto}. No cumple aniversario este mes.`,
      });
    }

    const queryBonoOmitido = `
        SELECT DISTINCT e.emp_cedula, e.emp_fecha_inicio_est
        FROM empleado e
        JOIN conceliq liq ON e.emp_cedula = liq.emp_cedula AND liq.cal_id = $1
        WHERE EXTRACT(MONTH FROM e.emp_fecha_inicio_est) = EXTRACT(MONTH FROM CAST($2 AS DATE))
          AND EXTRACT(YEAR FROM e.emp_fecha_inicio_est) < EXTRACT(YEAR FROM CAST($2 AS DATE))
          AND NOT EXISTS (SELECT 1 FROM conceliq c2 WHERE c2.cal_id = $1 AND c2.emp_cedula = e.emp_cedula AND c2.con_codigo = 800);
    `;
    const bonosO = await this.db.query(
      queryBonoOmitido,
      [calIdActual, fechaInicio],
      clientKey,
    );
    for (const b of bonosO.rows) {
      novedades.push({
        tipo_descuadre: 'OMISION_BONO_SERVICIO',
        cedula_empleado: b.emp_cedula,
        detalle: `Cumple un año más de servicio este mes y NO se le pagó el concepto 800.`,
      });
    }

    return novedades;
  }

  async getContextIA(
    clientKey: string,
    data: AuditIncidency[],
    calIdActual: number,
    fInicio: string,
    fFin: string,
  ): Promise<PayrollAuditResult[]> {
    const diccionarioConceptos = await this.loadDiccionario(clientKey);
    const contextoIA: PayrollAuditResult[] = [];
    for (const item of data) {
      const infoExtra: any = {};
      const queryManual = `SELECT ma_codigo_concepto, ma_valor_concepto FROM cmanual WHERE emp_cedula = $1 AND cal_id = $2`;
      const manuales = await this.db.query(
        queryManual,
        [item.cedula_empleado || item.emp_cedula, calIdActual],
        clientKey,
      );
      if (manuales.rows.length > 0) {
        infoExtra.ALERTA_INVERVENCION_MANUAL =
          'El usuario forzó conceptos manualmente.';
        infoExtra.conceptos_digitados = manuales.rows;
      }

      switch (item.tipo_descuadre) {
        case 'ERROR_CALCULO_RETROACTIVO':
          infoExtra.alerta =
            'El value pagado por concepto de retroactivo NO equivale exactamente al 7% del salario base histórico acumulado.';
          infoExtra.instruccion_ia =
            'Indica la base histórica sumada, explica que el aumento por decreto es del 7% y muestra la diferencia exacta.';
          break;
        case 'ERROR_SALUD_RETROACTIVO':
        case 'ERROR_PENSION_RETROACTIVO':
          infoExtra.alerta =
            'Evasión de Seguridad Social: No se descontó el 4% exacto sobre el pago retroactivo.';
          infoExtra.instruccion_ia =
            'Indica que no se descontó el 4% correcto sobre la base salarial del retroactivo.';
          break;
        case 'OMISION_DESCUENTO_SUBSIDIO':
          infoExtra.alerta =
            'Pérdida de Derecho a Subsidio: El empleado superó los topes legales con el aumento del 7%.';
          infoExtra.instruccion_ia =
            'Explica que el nuevo sueldo proyectado supera el tope legal y se omitió el reintegro.';
          break;
        case 'ERROR_BONIFICACION_RETROACTIVO':
          infoExtra.alerta =
            'Inconsistencia detectada en Bonificación por Servicios.';
          infoExtra.instruccion_ia =
            'Menciona que la bonificación (38% del sueldo) no coincide con el recálculo.';
          break;
        case 'ERROR_VACACIONES_RETROACTIVO':
          infoExtra.alerta =
            'Inconsistencia en el recálculo de doceavas para Vacaciones.';
          infoExtra.instruccion_ia =
            'Informa sobre el error en el recálculo del retroactivo de vacaciones incluyendo doceavas.';
          break;
        case 'NORMALIZACION_DIAS':
          infoExtra.alerta =
            'El sueldo base y el neto son mayores este mes porque el empleado normalizó sus días laborados.';
          break;
        case 'OTRO_CONCEPTO_DETECTADO':
          const queryActual = `SELECT con_codigo, liq_valor_concepto FROM conceliq WHERE emp_cedula = $1 AND cal_id = $2 AND con_codigo NOT IN (100,110);`;
          const actualRows = await this.db.query(
            queryActual,
            [item.cedula_empleado || item.emp_cedula, calIdActual],
            clientKey,
          );
          infoExtra.conceptos_adicionales_actuales = actualRows.rows.map(
            (c) => ({
              codigo_concepto: c.con_codigo,
              nombre_concepto:
                diccionarioConceptos[c.con_codigo] ||
                'Concepto ' + c.con_codigo,
              valor_liquidado: c.liq_valor_concepto,
            }),
          );
          break;
        case 'PRESTAMO_OMITIDO':
          const nombreDescuento =
            diccionarioConceptos[item.codigo_concepto_omitido] ||
            'Concepto Desconocido';
          infoExtra.alerta = `Deducción activa omitida: ${nombreDescuento}.`;
          break;
      }
      contextoIA.push({ informacionBase: item, extraData: infoExtra });
    }
    return contextoIA;
  }

  async generateAuditReport(empleadoData: any): Promise<string> {
    const { text } = await generateText({
      model: openai('o3-mini'),
      system: `Eres un experto auditor de nómina senior en Colombia. 
      Analiza el JSON proporcionado, cruza 'informacionBase' con 'extraData' y genera un informe profesional.
      - Menciona valores exactos en pesos ($).
      - Identifica al empleado por su cédula.
      - Sé directo y formal.
      FORMATO: Un solo párrafo de texto plano.`,
      prompt: JSON.stringify(empleadoData, null, 2),
    });
    return text;
  }

  async getRetroactivo(
    clientKey: string,
    calIdActual: number,
    fechaInicio: string,
    fechaFin: string,
  ): Promise<AuditIncidency[]> {
    const queryRetroactivo = `
      WITH HistoricoAcumulado AS (
          SELECT
              h.emp_cedula,
              SUM(CASE WHEN h.con_codigo_concepto IN (1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 100, 101, 102, 103, 110, 111, 120, 180, 200, 201, 600, 601, 602, 630, 631, 632, 700, 710, 800, 801, 810, 900, 901, 1100, 1200, 1210, 1300, 1400, 1410, 1500, 1600, 1602, 1700, 1800, 2000, 2005, 2100, 2200, 2300, 2500, 2600, 2700, 3000)
                  THEN h.acu_valor_concepto ELSE 0 END) AS base_historica_total,
              SUM(CASE WHEN h.con_codigo_concepto IN (1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 100, 101, 102, 103, 110, 111, 120, 180, 200, 201, 700, 710, 800, 801, 810, 1100, 1600, 1602, 1800, 2000, 2005, 2100, 2200, 2300, 2500, 2600, 2700, 3000)
                  THEN h.acu_valor_concepto ELSE 0 END) AS base_historica_ley100,
              MAX(CASE WHEN h.con_codigo_concepto IN (100, 101, 102, 103, 110, 111) THEN h.acu_valor_concepto ELSE 0 END) AS ultimo_sueldo_base,
              SUM(CASE WHEN h.con_codigo_concepto IN (800,801,802) THEN h.acu_valor_concepto ELSE 0 END) AS historico_bonificacion,
              MAX(CASE WHEN h.con_codigo_concepto = 1100 THEN h.acu_dias_trabajados ELSE 0 END) AS dias_vacaciones,
              MAX(CASE WHEN h.con_codigo_concepto = 150 THEN h.acu_valor_concepto ELSE 0 END) AS prima_coordinacion,
              SUM(CASE WHEN h.con_codigo_concepto IN (1100, 1200, 1210) THEN h.acu_valor_concepto ELSE 0 END) AS historico_vacaciones_pagado
          FROM conceacu h
          INNER JOIN calendario_pro cal ON h.cal_id = cal.cal_id
          WHERE h.con_codigo_concepto IN (1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 100, 101, 102, 103, 110, 111, 120, 180, 200, 201, 600, 601, 602, 630, 631, 632, 700, 710, 800, 801, 810, 900, 901, 1100, 1200, 1210, 1300, 1400, 1410, 1500, 1600, 1602, 1700, 1800, 2000, 2005, 2100, 2200, 2300, 2500, 2600, 2700, 3000)
            AND cal.cal_fcha_ini >= $2
            AND cal.cal_fcha_fin <= $3
          GROUP BY h.emp_cedula
      ),
      RetroPagado AS (
          SELECT
              emp_cedula,
              SUM(CASE WHEN con_codigo IN (1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 100, 101, 102, 103, 110, 111, 120, 180, 200, 201, 600, 601, 602, 630, 631, 632, 700, 710, 800, 801, 810, 900, 901, 1100, 1200, 1210, 1300, 1400, 1410, 1500, 1600, 1602, 1700, 1800, 2000, 2005, 2100, 2200, 2300, 2500, 2600, 2700, 3000)
                  THEN liq_valor_concepto ELSE 0 END) AS retro_pagado_total,
              SUM(CASE WHEN con_codigo IN (1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 100, 101, 102, 103, 110, 111, 120, 180, 200, 201, 700, 710, 800, 801, 810, 1100, 1600, 1602, 1700, 1800, 2000, 2005, 2100, 2200, 2300, 2500, 2600, 2700, 3000) THEN liq_valor_concepto ELSE 0 END) AS retro_pagado_ley100,
              SUM(CASE WHEN con_codigo IN (1100, 1200, 1210, 1300, 1400, 1410, 1500)
                  THEN liq_valor_concepto ELSE 0 END) AS retro_pagado_vacaciones,
              SUM(CASE WHEN con_codigo IN (400, 401, 402) THEN liq_valor_concepto ELSE 0 END) AS retro_transporte,
              SUM(CASE WHEN con_codigo IN (500, 501) THEN liq_valor_concepto ELSE 0 END) AS retro_alimentacion,
              SUM(CASE WHEN con_codigo IN (7200, 7201) THEN liq_valor_concepto ELSE 0 END) AS retro_salud,
              SUM(CASE WHEN con_codigo IN (5200, 5201, 5202) THEN liq_valor_concepto ELSE 0 END) AS retro_pension,
              SUM(CASE WHEN con_codigo = 6200 THEN liq_valor_concepto ELSE 0 END) AS retro_fsp,
              SUM(CASE WHEN con_codigo = 502 THEN liq_valor_concepto ELSE 0 END) AS descuento_transporte,
              SUM(CASE WHEN con_codigo = 503 THEN liq_valor_concepto ELSE 0 END) AS descuento_alimentacion,
              SUM(CASE WHEN con_codigo IN (800, 801, 802) THEN liq_valor_concepto ELSE 0 END) AS retro_bonificacion
          FROM conceliq
          WHERE cal_id = $1 AND liq_quincena_numero = 99
          GROUP BY emp_cedula
      )
      SELECT
          h.emp_cedula, h.base_historica_total,
		h.base_historica_ley100,
		h.ultimo_sueldo_base,
		h.historico_bonificacion,
          COALESCE(p.retro_pagado_total, 0) AS retro_pagado_total,
          COALESCE(p.retro_pagado_ley100, 0) AS retro_pagado_ley100,
          COALESCE(p.retro_pagado_vacaciones, 0) AS retro_pagado_vacaciones,
          COALESCE(p.retro_transporte, 0) AS retro_transporte,
          COALESCE(p.retro_alimentacion, 0) AS retro_alimentacion,
          COALESCE(p.retro_salud, 0) AS retro_salud,
          COALESCE(p.retro_pension, 0) AS retro_pension,
          COALESCE(p.retro_fsp, 0) AS retro_fsp,
          COALESCE(p.descuento_transporte, 0) AS descuento_transporte,
          COALESCE(p.descuento_alimentacion, 0) AS descuento_alimentacion,
          COALESCE(p.retro_bonificacion, 0) AS retro_bonificacion
      FROM HistoricoAcumulado h
      INNER JOIN RetroPagado p ON h.emp_cedula = p.emp_cedula ORDER BY h.emp_cedula ASC;`;

    const { rows } = await this.db.query(
      queryRetroactivo,
      [calIdActual, fechaInicio, fechaFin],
      clientKey,
    );
    const erroresRetroactivo: AuditIncidency[] = [];

    for (const item of rows) {
      const baseHistorica = Math.round(Number(item.base_historica_total));
      const retroPagado = Math.round(Number(item.retro_pagado_total));
      const retroPagadoLey100 = Math.round(Number(item.retro_pagado_ley100));
      const retroVacaciones = Math.round(Number(item.retro_pagado_vacaciones));
      const retroBoniPagada = Math.round(Number(item.retro_bonificacion));

      const bonifiAnterior = Number(item.historico_bonificacion);
      const historicoVacaciones = Number(item.historico_vacaciones_pagado);
      const ultimoSueldoBase = Number(item.ultimo_sueldo_base);
      const nuevoSueldoProyectado = Math.round(ultimoSueldoBase * 1.07);

      const baseLineal = baseHistorica - bonifiAnterior - historicoVacaciones;
      const retroEsperadoLineal = Math.round(baseLineal * 0.07);
      const nuevaBonifi = Math.round(nuevoSueldoProyectado * 0.38);
      const diferenciaEsperadaBono =
        bonifiAnterior > 0 ? nuevaBonifi - bonifiAnterior : 0;

      let retroEsperadoVacaciones = 0;
      let totalVacacionesNuevo = 0;
      const diasDisfrutados = Number(item.dias_vacaciones);

      if (retroVacaciones > 0 && diasDisfrutados > 0) {
        const primaCoordinacionAntigua = Number(item.prima_coordinacion);
        const primaCoordinacionNueva = Math.round(
          primaCoordinacionAntigua * 1.07,
        );
        const doceavaBSP = Math.round(nuevaBonifi / 12);
        const doceavaNavidad = Math.round(nuevoSueldoProyectado / 12);

        const subsidioTransporte =
          nuevoSueldoProyectado <= this.CONSTANTES_LEY.TOPE_TRANSPORTE
            ? this.CONSTANTES_LEY.VALOR_TRANSPORTE
            : 0;
        const subsidioAlimentacion =
          nuevoSueldoProyectado <= this.CONSTANTES_LEY.TOPE_ALIMENTACION
            ? this.CONSTANTES_LEY.VALOR_ALIMENTACION
            : 0;

        const baseVacaciones =
          nuevoSueldoProyectado +
          doceavaBSP +
          doceavaNavidad +
          subsidioTransporte +
          subsidioAlimentacion +
          primaCoordinacionNueva;

        const valorDiaVacaciones = baseVacaciones / 30;
        const sueldoVacacional = Math.round(
          valorDiaVacaciones * diasDisfrutados,
        );
        const primaVacacional = Math.round(valorDiaVacaciones * 15);
        const valorDiaSueldoBasico = nuevoSueldoProyectado / 30;
        const bonificacionRecreacion = Math.round(
          valorDiaSueldoBasico * 3 * (diasDisfrutados / 15),
        );

        totalVacacionesNuevo =
          sueldoVacacional + primaVacacional + bonificacionRecreacion;
        retroEsperadoVacaciones = totalVacacionesNuevo - historicoVacaciones;
      }

      const retroEsperadoTotal =
        retroEsperadoLineal + diferenciaEsperadaBono + retroEsperadoVacaciones;
      const difRetroTotal = Math.abs(retroPagado - retroEsperadoTotal);

      if (difRetroTotal > 100) {
        if (
          bonifiAnterior > 0 &&
          Math.abs(diferenciaEsperadaBono - retroBoniPagada) > 100
        ) {
          erroresRetroactivo.push({
            tipo_descuadre: 'ERROR_BONIFICACION_RETROACTIVO',
            detalle: `Valor esperado bono: $${diferenciaEsperadaBono}, liquidado: $${retroBoniPagada}.`,
            ...item,
          });
        } else if (
          retroVacaciones > 0 &&
          diasDisfrutados > 0 &&
          Math.abs(retroEsperadoVacaciones - retroVacaciones) > 100
        ) {
          erroresRetroactivo.push({
            tipo_descuadre: 'ERROR_VACACIONES_RETROACTIVO',
            detalle: `Se debió pagar $${retroEsperadoVacaciones} de retroactivo de vacaciones, se liquidó $${retroVacaciones}.`,
            ...item,
          });
        } else {
          erroresRetroactivo.push({
            tipo_descuadre: 'ERROR_CALCULO_RETROACTIVO',
            detalle: `Liquidado $${retroPagado}, esperado $${retroEsperadoTotal}. Diferencia de $${difRetroTotal}.`,
            ...item,
          });
        }
      }

      const ibcRetroRedondeado = Math.round(retroPagadoLey100 / 1000) * 1000;
      const saludEsperada = Math.round((ibcRetroRedondeado * 0.04) / 100) * 100;
      const pensionEsperada =
        Math.round((ibcRetroRedondeado * 0.04) / 100) * 100;
      const saludDescontada = Number(item.retro_salud);
      const pensionDescontada = Number(item.retro_pension);

      if (ibcRetroRedondeado > 0) {
        if (Math.abs(saludDescontada - saludEsperada) > 150) {
          erroresRetroactivo.push({
            tipo_descuadre: 'ERROR_SALUD_RETROACTIVO',
            detalle: `Base: $${retroPagadoLey100}. Salud esperada: $${saludEsperada}, descontada: $${saludDescontada}.`,
            ...item,
          });
        }
        if (Math.abs(pensionDescontada - pensionEsperada) > 150) {
          erroresRetroactivo.push({
            tipo_descuadre: 'ERROR_PENSION_RETROACTIVO',
            detalle: `Base: $${retroPagadoLey100}. Pensión esperada: $${pensionEsperada}, descontada: $${pensionDescontada}.`,
            ...item,
          });
        }
      }

      if (
        ultimoSueldoBase > 0 &&
        ultimoSueldoBase <= this.CONSTANTES_LEY.TOPE_TRANSPORTE &&
        nuevoSueldoProyectado > this.CONSTANTES_LEY.TOPE_TRANSPORTE &&
        Number(item.descuento_transporte) === 0
      ) {
        erroresRetroactivo.push({
          tipo_descuadre: 'OMISION_DESCUENTO_SUBSIDIO',
          detalle: `Sueldo aumenta a $${nuevoSueldoProyectado} superando tope transporte. Se omitió reintegro.`,
          ...item,
        });
      }
    }
    return erroresRetroactivo;
  }
}

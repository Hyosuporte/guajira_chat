# Assistant UI - Backend (Servicios de Auditoría e IA de Nómina)

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

## Descripción

Este es el backend de **Assistant UI**, un ecosistema basado en NestJS diseñado para la **Auditoría de Nómina** y consultas de base de datos mediante **Inteligencia Artificial**. El sistema permite a los usuarios realizar preguntas en lenguaje natural sobre la base de datos `GUAJIRA2021_PROD`, generar reportes en Excel y auditar procesos de nómina colombiana (Sueldos, Salud, Pensión, Subsidios y Retroactivos) con el apoyo de modelos de OpenAI.

## Tecnologías Principales

- **Framework:** [NestJS](https://github.com/nestjs/nest) (Node.js)
- **Base de Datos:** PostgreSQL (con extensión `pgvector` para embeddings)
- **IA SDK:** [Vercel AI SDK](https://sdk.vercel.ai/docs) con OpenAI (`gpt-4o-mini`, `o3-mini`)
- **Embeddings:** [FastEmbed](https://github.com/qdrant/fastembed-js) (Local BGE-Small-EN)
- **Documentación:** Swagger UI
- **Reportes:** `xlsx-populate` para generación dinámica de archivos Excel.

## Características Principales

1.  **Chat con IA (SQL Agent):**
    - Consultas a la base de datos en lenguaje natural.
    - Generación automática de SQL y visualización de resultados.
    - Exportación de resultados directamente a Excel.
    - Búsqueda semántica de tablas y vistas usando embeddings locales.
2.  **Módulo de Auditoría de Nómina:**
    - Validación legal de topes (Transporte, Alimentación, FSP).
    - Detección de errores matemáticos en Salud y Pensión.
    - Análisis de variaciones inusuales en sueldos netos.
    - Detección de novedades omitidas (Préstamos, Licencias, Embargos, Primas).
3.  **Auditoría de Retroactivos:**
    - Cálculo y validación de retroactivos salariales (7% legal).
    - Recálculo de doceavas de vacaciones y bonificaciones.
4.  **Informes Generados por IA:**
    - Generación de resúmenes profesionales de hallazgos de auditoría por empleado usando LLMs.

---

## Requisitos Previos

- **Node.js:** >= 20.x
- **pnpm:** Instalado globalmente (`npm install -g pnpm`)
- **PostgreSQL:** Con la extensión `pgvector` habilitada.
- **OpenAI API Key:** Para los servicios de procesamiento de lenguaje natural.

---

## Configuración e Instalación

1.  **Clonar el repositorio:**
    ```bash
    git clone <url-del-repositorio>
    cd assistant-ui
    ```

2.  **Instalar dependencias:**
    ```bash
    pnpm install
    ```

3.  **Configurar variables de entorno:**
    Copia el archivo `.env.example` a `.env` y completa los valores requeridos:
    ```bash
    cp .env.example .env
    ```

---

## Ejecución

### Desarrollo
```bash
# Modo watch (recarga automática)
$ pnpm run start:dev
```

### Producción
```bash
# Construir el proyecto
$ pnpm run build

# Ejecutar la versión compilada
$ pnpm run start:prod
```

### Pruebas (Tests)
```bash
# Unitarios
$ pnpm run test

# End-to-end (e2e)
$ pnpm run test:e2e

# Cobertura
$ pnpm run test:cov
```

---

## Documentación de la API

Una vez que el servidor esté en ejecución, puedes acceder a la documentación interactiva de Swagger en:

`http://localhost:3000/docs`

---

## Estructura del Proyecto

```text
src/
├── audit/          # Lógica de auditoría de nómina (hallazgos, retroactivos, reportes IA)
├── chat/           # Motor de chat con IA y herramientas de generación de SQL/Excel
├── common/         # Módulos compartidos (Conexión a base de datos PostgreSQL)
├── embeddings/     # Servicio de búsqueda semántica con FastEmbed
├── main.ts         # Punto de entrada de la aplicación
└── app.module.ts   # Módulo principal
```

---

## Licencia

Este proyecto es software privado y no tiene licencia de código abierto definida (`UNLICENSED`).

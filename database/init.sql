-- 1. Habilitar la extensión pgvector para búsquedas semánticas
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla para almacenar los embeddings de las vistas de la base de datos
-- Esta tabla permite que la IA sepa qué tablas existen y qué información contienen
CREATE TABLE IF NOT EXISTS public.view_embeddings (
    id SERIAL PRIMARY KEY,
    view_name TEXT NOT NULL,
    schema_name TEXT NOT NULL,
    metadata JSONB, -- Almacena descripción de campos y propósito de la vista
    embedding vector(384), -- Vector de 384 dimensiones (para el modelo BGE-Small-EN)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Índice para búsquedas rápidas por similitud de coseno
CREATE INDEX ON public.view_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- NOTA: Las tablas de nómina (conceliq, calendario_pro, etc.) se asumen 
-- existentes en el schema "SIAN2022" y "guajira2021_sico4" según el código.

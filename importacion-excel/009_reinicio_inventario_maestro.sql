-- Proyecto: Inventario corporativo STP
-- Migración: 009 - Reinicio limpio para el inventario maestro
--
-- DESTRUCTIVO: elimina los datos operativos de prueba y los catálogos que
-- serán reconstruidos desde INVENTARIO_MAESTRO_STP.xlsx.
--
-- Conserva:
--   * tipos_movimiento y su configuración;
--   * usuarios compartidos, roles, FDW y auth_shared;
--   * estructura de solicitudes, archivos, movimientos y ubicaciones;
--   * configuración externa de Nextcloud.
--
-- Elimina datos de:
--   * solicitudes, detalles, historial y metadatos de archivos;
--   * movimientos e inventario;
--   * unidades, condiciones, ubicaciones y almacenes;
--   * categorías anteriores.
--
-- Ejecutar conectado a inventario_db, con la aplicación detenida y después de
-- crear un backup completo. Desplegar junto con la aplicación compatible.

BEGIN;

SELECT pg_advisory_xact_lock(2026080401);

DO $$
BEGIN
    IF to_regclass('public.inventario') IS NULL
       OR to_regclass('public.categorias') IS NULL
       OR to_regclass('public.movimientos') IS NULL
       OR to_regclass('public.solicitudes_equipos') IS NULL
       OR to_regclass('public.solicitudes_equipos_detalle') IS NULL
       OR to_regclass('public.unidades_medida') IS NULL
       OR to_regclass('public.ubicaciones') IS NULL THEN
        RAISE EXCEPTION
            'El esquema esperado no está completo. No se aplicó la migración 009.';
    END IF;
END
$$;

-- =========================================================
-- 1. LIMPIEZA DE DATOS DE PRUEBA
-- =========================================================

TRUNCATE TABLE
    public.solicitudes_equipos_archivos,
    public.solicitudes_equipos_historial,
    public.solicitudes_equipos_detalle,
    public.solicitudes_equipos,
    public.movimientos,
    public.inventario,
    public.ubicaciones,
    public.almacenes,
    public.unidades_medida,
    public.condiciones
RESTART IDENTITY;

-- La limpieza de metadatos no borra los archivos físicos de prueba que ya
-- existen en Nextcloud. Esos archivos se retiran por separado si corresponde.

-- =========================================================
-- 2. CLASIFICACIÓN CORPORATIVA
-- =========================================================

CREATE TABLE public.grupos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    prefijo         VARCHAR(12) NOT NULL UNIQUE,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT grupos_nombre_no_vacio CHECK (length(btrim(nombre)) > 0),
    CONSTRAINT grupos_prefijo_valido CHECK (prefijo ~ '^[A-Z0-9]+$')
);

CREATE TABLE public.familias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL UNIQUE,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT familias_nombre_no_vacio CHECK (length(btrim(nombre)) > 0)
);

CREATE TABLE public.subfamilias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(180) NOT NULL UNIQUE,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT subfamilias_nombre_no_vacio CHECK (length(btrim(nombre)) > 0)
);

-- El glosario permite que una familia pertenezca a varios grupos y que una
-- subfamilia aparezca en más de una familia. Por eso la jerarquía válida se
-- guarda como combinación explícita.
CREATE TABLE public.clasificaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grupo_id        BIGINT NOT NULL REFERENCES public.grupos(id),
    familia_id      BIGINT NOT NULL REFERENCES public.familias(id),
    subfamilia_id   BIGINT NOT NULL REFERENCES public.subfamilias(id),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT clasificaciones_combinacion_unica
        UNIQUE (grupo_id, familia_id, subfamilia_id)
);

CREATE INDEX idx_clasificaciones_grupo
    ON public.clasificaciones (grupo_id);
CREATE INDEX idx_clasificaciones_familia
    ON public.clasificaciones (familia_id);
CREATE INDEX idx_clasificaciones_subfamilia
    ON public.clasificaciones (subfamilia_id);

-- =========================================================
-- 3. NUEVA ESTRUCTURA DEL INVENTARIO
-- =========================================================

DROP INDEX IF EXISTS public.idx_inventario_categoria;

ALTER TABLE public.inventario
    DROP CONSTRAINT IF EXISTS inventario_categoria_id_fkey,
    DROP CONSTRAINT IF EXISTS ck_inventario_costo,
    DROP COLUMN categoria_id,
    DROP COLUMN IF EXISTS valor_total,
    DROP COLUMN IF EXISTS costo_unitario,
    ADD COLUMN clasificacion_id BIGINT NOT NULL,
    ADD CONSTRAINT inventario_clasificacion_id_fkey
        FOREIGN KEY (clasificacion_id)
        REFERENCES public.clasificaciones(id),
    ALTER COLUMN ubicacion_id DROP NOT NULL;

CREATE INDEX idx_inventario_clasificacion
    ON public.inventario (clasificacion_id);

DROP TABLE public.categorias;

-- =========================================================
-- 4. SOLICITUDES Y MOVIMIENTOS SIN PRECIOS
-- =========================================================

ALTER TABLE public.solicitudes_equipos_detalle
    DROP CONSTRAINT IF EXISTS solicitudes_detalle_costo_declarado_valido,
    DROP COLUMN IF EXISTS costo_unitario_declarado,
    ADD COLUMN clasificacion_id BIGINT NOT NULL,
    ADD CONSTRAINT solicitudes_equipos_detalle_clasificacion_id_fkey
        FOREIGN KEY (clasificacion_id)
        REFERENCES public.clasificaciones(id);

CREATE INDEX idx_solicitudes_detalle_clasificacion
    ON public.solicitudes_equipos_detalle (clasificacion_id);

ALTER TABLE public.movimientos
    DROP CONSTRAINT IF EXISTS movimientos_costos_unitarios_validos,
    DROP COLUMN IF EXISTS costo_unitario_anterior,
    DROP COLUMN IF EXISTS costo_unitario_ingreso,
    DROP COLUMN IF EXISTS costo_unitario_posterior;

COMMENT ON TABLE public.clasificaciones IS
    'Combinaciones válidas de Grupo, Familia y Subfamilia del glosario corporativo.';
COMMENT ON COLUMN public.inventario.clasificacion_id IS
    'Clasificación corporativa vigente del artículo.';
COMMENT ON COLUMN public.inventario.ubicacion_id IS
    'Ubicación física; puede ser NULL mientras el artículo todavía sea solo de catálogo.';
COMMENT ON COLUMN public.solicitudes_equipos_detalle.clasificacion_id IS
    'Clasificación declarada para el equipo enviado.';

-- =========================================================
-- 5. PERMISOS PARA LA APLICACIÓN
-- =========================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inventario_importador') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON TABLE public.grupos,
                     public.familias,
                     public.subfamilias,
                     public.clasificaciones
            TO inventario_importador;
        GRANT USAGE, SELECT
            ON SEQUENCE public.grupos_id_seq,
                        public.familias_id_seq,
                        public.subfamilias_id_seq,
                        public.clasificaciones_id_seq
            TO inventario_importador;
    END IF;
END
$$;

COMMIT;

-- Verificación: todos estos conteos deben devolver cero inmediatamente después
-- del reinicio y antes de importar el maestro.
--
-- SELECT 'inventario' AS tabla, count(*) FROM public.inventario
-- UNION ALL SELECT 'movimientos', count(*) FROM public.movimientos
-- UNION ALL SELECT 'solicitudes', count(*) FROM public.solicitudes_equipos
-- UNION ALL SELECT 'unidades', count(*) FROM public.unidades_medida
-- UNION ALL SELECT 'ubicaciones', count(*) FROM public.ubicaciones
-- UNION ALL SELECT 'almacenes', count(*) FROM public.almacenes
-- UNION ALL SELECT 'condiciones', count(*) FROM public.condiciones;

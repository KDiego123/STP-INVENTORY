BEGIN;

ALTER TABLE public.solicitudes_equipos_archivos
    ADD COLUMN IF NOT EXISTS estado_almacenamiento varchar(20),
    ADD COLUMN IF NOT EXISTS ruta_local text,
    ADD COLUMN IF NOT EXISTS intentos_sincronizacion integer,
    ADD COLUMN IF NOT EXISTS ultimo_error_sincronizacion text,
    ADD COLUMN IF NOT EXISTS ultimo_intento_en timestamp with time zone,
    ADD COLUMN IF NOT EXISTS sincronizado_en timestamp with time zone;

UPDATE public.solicitudes_equipos_archivos
SET
    estado_almacenamiento = COALESCE(
        estado_almacenamiento,
        CASE
            WHEN nextcloud_etag IS NOT NULL OR nextcloud_file_id IS NOT NULL
                THEN 'SINCRONIZADO'
            ELSE 'PENDIENTE'
        END
    ),
    intentos_sincronizacion = COALESCE(intentos_sincronizacion, 0),
    sincronizado_en = CASE
        WHEN sincronizado_en IS NULL
         AND (nextcloud_etag IS NOT NULL OR nextcloud_file_id IS NOT NULL)
            THEN creado_en
        ELSE sincronizado_en
    END;

ALTER TABLE public.solicitudes_equipos_archivos
    ALTER COLUMN estado_almacenamiento SET DEFAULT 'SINCRONIZADO',
    ALTER COLUMN estado_almacenamiento SET NOT NULL,
    ALTER COLUMN intentos_sincronizacion SET DEFAULT 0,
    ALTER COLUMN intentos_sincronizacion SET NOT NULL;

ALTER TABLE public.solicitudes_equipos_archivos
    DROP CONSTRAINT IF EXISTS solicitudes_archivos_estado_almacenamiento_valido;

ALTER TABLE public.solicitudes_equipos_archivos
    ADD CONSTRAINT solicitudes_archivos_estado_almacenamiento_valido
    CHECK (estado_almacenamiento IN ('PENDIENTE', 'SINCRONIZADO', 'ERROR'));

ALTER TABLE public.solicitudes_equipos_archivos
    DROP CONSTRAINT IF EXISTS solicitudes_archivos_intentos_validos;

ALTER TABLE public.solicitudes_equipos_archivos
    ADD CONSTRAINT solicitudes_archivos_intentos_validos
    CHECK (intentos_sincronizacion >= 0);

CREATE INDEX IF NOT EXISTS ix_solicitudes_archivos_pendientes
    ON public.solicitudes_equipos_archivos
    (ultimo_intento_en NULLS FIRST, creado_en)
    WHERE estado_almacenamiento IN ('PENDIENTE', 'ERROR')
      AND eliminado_en IS NULL;

COMMENT ON COLUMN public.solicitudes_equipos_archivos.estado_almacenamiento IS
    'PENDIENTE o ERROR mientras espera sincronización; SINCRONIZADO cuando existe en Nextcloud.';

COMMENT ON COLUMN public.solicitudes_equipos_archivos.ruta_local IS
    'Ruta relativa de la copia privada conservada por el backend para continuidad operativa.';

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.solicitudes_equipos_archivos
TO inventario_importador;

COMMIT;

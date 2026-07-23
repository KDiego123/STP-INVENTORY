BEGIN;

ALTER TABLE public.inventario
    ADD COLUMN IF NOT EXISTS marca varchar(100),
    ADD COLUMN IF NOT EXISTS modelo varchar(100),
    ADD COLUMN IF NOT EXISTS numero_serie varchar(120),
    ADD COLUMN IF NOT EXISTS codigo_patrimonial varchar(120);

ALTER TABLE public.solicitudes_equipos_detalle
    ALTER COLUMN inventario_id DROP NOT NULL;

ALTER TABLE public.solicitudes_equipos_detalle
    ADD COLUMN IF NOT EXISTS nombre_equipo varchar(250),
    ADD COLUMN IF NOT EXISTS marca varchar(100),
    ADD COLUMN IF NOT EXISTS modelo varchar(100),
    ADD COLUMN IF NOT EXISTS numero_serie varchar(120),
    ADD COLUMN IF NOT EXISTS codigo_patrimonial varchar(120),
    ADD COLUMN IF NOT EXISTS unidad_medida_id bigint,
    ADD COLUMN IF NOT EXISTS fecha_calibracion_salida date,
    ADD COLUMN IF NOT EXISTS fecha_calibracion_recepcion date;

UPDATE public.solicitudes_equipos_detalle AS detalle
SET
    nombre_equipo = COALESCE(detalle.nombre_equipo, inventario.descripcion),
    unidad_medida_id = COALESCE(detalle.unidad_medida_id, inventario.unidad_medida_id),
    fecha_calibracion_salida = COALESCE(
        detalle.fecha_calibracion_salida,
        inventario.fecha_calibracion
    )
FROM public.inventario AS inventario
WHERE detalle.inventario_id = inventario.id
  AND (
      detalle.nombre_equipo IS NULL
      OR detalle.unidad_medida_id IS NULL
      OR detalle.fecha_calibracion_salida IS NULL
  );

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.solicitudes_equipos_detalle
        WHERE cantidad <> trunc(cantidad)
    ) THEN
        RAISE EXCEPTION
            'No se puede convertir solicitudes_equipos_detalle.cantidad a entero: existen cantidades decimales.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'solicitudes_equipos_detalle'
          AND column_name = 'cantidad'
          AND data_type <> 'integer'
    ) THEN
        ALTER TABLE public.solicitudes_equipos_detalle
            ALTER COLUMN cantidad TYPE integer USING cantidad::integer;
    END IF;
END
$$;

ALTER TABLE public.solicitudes_equipos_detalle
    DROP CONSTRAINT IF EXISTS solicitudes_equipos_detalle_cantidad_check;

ALTER TABLE public.solicitudes_equipos_detalle
    DROP CONSTRAINT IF EXISTS solicitud_equipo_cantidad_positiva;

ALTER TABLE public.solicitudes_equipos_detalle
    ADD CONSTRAINT solicitud_equipo_cantidad_positiva
    CHECK (cantidad > 0);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'solicitudes_detalle_unidad_medida_fk'
          AND conrelid = 'public.solicitudes_equipos_detalle'::regclass
    ) THEN
        ALTER TABLE public.solicitudes_equipos_detalle
            ADD CONSTRAINT solicitudes_detalle_unidad_medida_fk
            FOREIGN KEY (unidad_medida_id)
            REFERENCES public.unidades_medida(id);
    END IF;
END
$$;

ALTER TABLE public.solicitudes_equipos_detalle
    ALTER COLUMN nombre_equipo SET NOT NULL,
    ALTER COLUMN unidad_medida_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_solicitudes_detalle_inventario
    ON public.solicitudes_equipos_detalle (inventario_id);

CREATE INDEX IF NOT EXISTS ix_solicitudes_detalle_serie
    ON public.solicitudes_equipos_detalle (numero_serie)
    WHERE numero_serie IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_inventario_numero_serie
    ON public.inventario (numero_serie)
    WHERE numero_serie IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_inventario_codigo_patrimonial
    ON public.inventario (codigo_patrimonial)
    WHERE codigo_patrimonial IS NOT NULL;

COMMENT ON COLUMN public.solicitudes_equipos_detalle.inventario_id IS
    'Artículo creado o vinculado por Logística; permanece nulo durante el preingreso.';

COMMENT ON COLUMN public.solicitudes_equipos_detalle.nombre_equipo IS
    'Descripción declarada por Mina antes de incorporar el equipo al inventario.';

COMMENT ON COLUMN public.solicitudes_equipos_detalle.cantidad IS
    'Cantidad entera de equipos incluidos en el detalle.';

COMMIT;

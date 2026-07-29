BEGIN;

ALTER TABLE public.solicitudes_equipos_detalle
    ADD COLUMN IF NOT EXISTS costo_unitario_declarado numeric(14,2);

UPDATE public.solicitudes_equipos_detalle AS detalle
SET costo_unitario_declarado = inventario.costo_unitario
FROM public.inventario AS inventario
WHERE detalle.inventario_id = inventario.id
  AND detalle.costo_unitario_declarado IS NULL
  AND inventario.costo_unitario IS NOT NULL;

UPDATE public.solicitudes_equipos_detalle
SET costo_unitario_declarado = 0
WHERE costo_unitario_declarado IS NULL;

ALTER TABLE public.solicitudes_equipos_detalle
    DROP CONSTRAINT IF EXISTS solicitudes_detalle_costo_declarado_valido;

ALTER TABLE public.solicitudes_equipos_detalle
    ALTER COLUMN costo_unitario_declarado SET NOT NULL,
    ADD CONSTRAINT solicitudes_detalle_costo_declarado_valido CHECK (
        costo_unitario_declarado >= 0
    );

ALTER TABLE public.movimientos
    ADD COLUMN IF NOT EXISTS costo_unitario_anterior numeric(14,2),
    ADD COLUMN IF NOT EXISTS costo_unitario_ingreso numeric(14,2),
    ADD COLUMN IF NOT EXISTS costo_unitario_posterior numeric(14,2);

ALTER TABLE public.movimientos
    DROP CONSTRAINT IF EXISTS movimientos_costos_unitarios_validos;

ALTER TABLE public.movimientos
    ADD CONSTRAINT movimientos_costos_unitarios_validos CHECK (
        (costo_unitario_anterior IS NULL OR costo_unitario_anterior >= 0)
        AND (costo_unitario_ingreso IS NULL OR costo_unitario_ingreso >= 0)
        AND (costo_unitario_posterior IS NULL OR costo_unitario_posterior >= 0)
    );

COMMENT ON COLUMN public.solicitudes_equipos_detalle.inventario_id IS
    'Articulo de inventario propuesto por Mina y confirmado o corregido por Logistica al recibir.';

COMMENT ON COLUMN public.solicitudes_equipos_detalle.costo_unitario_declarado IS
    'Costo unitario declarado para las unidades enviadas en este detalle.';

COMMENT ON COLUMN public.movimientos.costo_unitario_anterior IS
    'Costo promedio del articulo antes de una entrada valorizada.';

COMMENT ON COLUMN public.movimientos.costo_unitario_ingreso IS
    'Costo unitario de las unidades ingresadas.';

COMMENT ON COLUMN public.movimientos.costo_unitario_posterior IS
    'Costo promedio ponderado del articulo despues de la entrada.';

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.solicitudes_equipos_detalle, public.movimientos
TO inventario_importador;

COMMIT;

ALTER TABLE public.inventario
    ADD COLUMN IF NOT EXISTS calibracion varchar(20);

UPDATE public.inventario AS i
SET calibracion = 'SIN_CALIBRAR'
FROM public.categorias AS c
WHERE i.categoria_id = c.id
  AND upper(trim(c.nombre)) = 'EQUIPO'
  AND i.calibracion IS NULL;

ALTER TABLE public.inventario
    DROP CONSTRAINT IF EXISTS inventario_calibracion_valida;

ALTER TABLE public.inventario
    ADD CONSTRAINT inventario_calibracion_valida
    CHECK (
        calibracion IS NULL
        OR calibracion IN ('NO_CUMPLE', 'SIN_CALIBRAR', 'CALIBRADO')
    );

COMMENT ON COLUMN public.inventario.calibracion IS
    'Estado de calibración para artículos de categoría EQUIPO.';

BEGIN;

ALTER TABLE public.inventario
    ADD COLUMN IF NOT EXISTS almacenamiento_especifico boolean NOT NULL DEFAULT false;

UPDATE public.inventario
SET almacenamiento_especifico = true
WHERE modalidad_almacenamiento_id IS NOT NULL
   OR referencia_almacenamiento IS NOT NULL
   OR detalle_almacenamiento IS NOT NULL;

ALTER TABLE public.inventario
    DROP CONSTRAINT IF EXISTS inventario_almacenamiento_especifico_valido;

ALTER TABLE public.inventario
    ADD CONSTRAINT inventario_almacenamiento_especifico_valido CHECK (
        almacenamiento_especifico
        OR (
            modalidad_almacenamiento_id IS NULL
            AND referencia_almacenamiento IS NULL
            AND detalle_almacenamiento IS NULL
        )
    );

COMMENT ON COLUMN public.inventario.almacenamiento_especifico IS
    'Indica que el articulo usa una modalidad de almacenamiento adicional a su ubicacion y almacen; los detalles son opcionales.';

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.inventario
TO inventario_importador;

COMMIT;

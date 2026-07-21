ALTER TABLE public.inventario
    ADD COLUMN IF NOT EXISTS fecha_calibracion date;

COMMENT ON COLUMN public.inventario.fecha_calibracion IS
    'Fecha de la última calibración registrada para un equipo.';

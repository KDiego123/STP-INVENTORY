BEGIN;

ALTER TABLE public.solicitudes_equipos
    ADD COLUMN IF NOT EXISTS rechazado_por_usuario_id bigint,
    ADD COLUMN IF NOT EXISTS rechazado_por_nombre varchar(150),
    ADD COLUMN IF NOT EXISTS fecha_rechazo timestamp with time zone,
    ADD COLUMN IF NOT EXISTS motivo_rechazo text;

ALTER TABLE public.solicitudes_equipos
    DROP CONSTRAINT IF EXISTS solicitudes_equipos_estado_valido;

ALTER TABLE public.solicitudes_equipos
    ADD CONSTRAINT solicitudes_equipos_estado_valido CHECK (
        estado IN ('ESPERA_APROBACION', 'EN_CAMINO', 'RECIBIDO', 'RECHAZADO')
    );

ALTER TABLE public.solicitudes_equipos
    DROP CONSTRAINT IF EXISTS solicitudes_equipos_rechazo_completo;

ALTER TABLE public.solicitudes_equipos
    ADD CONSTRAINT solicitudes_equipos_rechazo_completo CHECK (
        estado <> 'RECHAZADO'
        OR (
            rechazado_por_nombre IS NOT NULL
            AND fecha_rechazo IS NOT NULL
            AND motivo_rechazo IS NOT NULL
            AND length(trim(motivo_rechazo)) >= 5
        )
    );

ALTER TABLE public.solicitudes_equipos_historial
    DROP CONSTRAINT IF EXISTS solicitudes_historial_estado_nuevo_valido;

ALTER TABLE public.solicitudes_equipos_historial
    ADD CONSTRAINT solicitudes_historial_estado_nuevo_valido CHECK (
        estado_nuevo IN ('ESPERA_APROBACION', 'EN_CAMINO', 'RECIBIDO', 'RECHAZADO')
    );

CREATE INDEX IF NOT EXISTS ix_solicitudes_equipos_rechazo
    ON public.solicitudes_equipos (fecha_rechazo DESC)
    WHERE estado = 'RECHAZADO';

COMMENT ON COLUMN public.solicitudes_equipos.motivo_rechazo IS
    'Motivo obligatorio registrado por Logistica al no aprobar la solicitud.';

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.solicitudes_equipos
TO inventario_importador;

COMMIT;

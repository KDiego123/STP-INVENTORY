-- Proyecto: Inventario Lima
-- Base de datos objetivo: inventario_db
-- Migracion: 001 - Esquema inicial
--
-- Ejecutar este archivo conectado a inventario_db.
-- El script se ejecuta dentro de una transaccion: si una instruccion falla,
-- PostgreSQL no confirmara parcialmente la migracion.

BEGIN;

-- =========================================================
-- CATALOGOS EDITABLES
-- =========================================================

CREATE TABLE categorias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE unidades_medida (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          VARCHAR(20) NOT NULL UNIQUE,
    nombre          VARCHAR(100) NOT NULL,
    permite_decimal BOOLEAN NOT NULL DEFAULT FALSE,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE almacenes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ubicaciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    almacen_id      BIGINT NOT NULL REFERENCES almacenes(id),
    codigo          VARCHAR(50) NOT NULL,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_ubicacion_almacen
        UNIQUE (almacen_id, codigo)
);

CREATE TABLE condiciones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL UNIQUE,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tipos_movimiento (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo              VARCHAR(30) NOT NULL UNIQUE,
    nombre              VARCHAR(100) NOT NULL,
    signo_stock         SMALLINT,
    requiere_origen     BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_destino    BOOLEAN NOT NULL DEFAULT FALSE,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_tipo_movimiento_signo
        CHECK (signo_stock IS NULL OR signo_stock IN (-1, 1))
);

-- =========================================================
-- TABLA PRINCIPAL: INVENTARIO
-- =========================================================

CREATE TABLE inventario (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo                  VARCHAR(50) NOT NULL UNIQUE,
    descripcion             TEXT NOT NULL,
    categoria_id            BIGINT NOT NULL REFERENCES categorias(id),
    unidad_medida_id        BIGINT NOT NULL REFERENCES unidades_medida(id),
    ubicacion_id            BIGINT NOT NULL REFERENCES ubicaciones(id),
    condicion_id            BIGINT REFERENCES condiciones(id),

    stock_actual            NUMERIC(14,3) NOT NULL DEFAULT 0,
    stock_minimo            NUMERIC(14,3),
    costo_unitario          NUMERIC(14,2),

    valor_total             NUMERIC(18,2)
        GENERATED ALWAYS AS (stock_actual * costo_unitario) STORED,

    fecha_ultima_entrada    DATE,
    fecha_ultima_salida     DATE,
    observaciones           TEXT,
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,

    creado_en               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_inventario_stock
        CHECK (stock_actual >= 0),

    CONSTRAINT ck_inventario_stock_minimo
        CHECK (stock_minimo IS NULL OR stock_minimo >= 0),

    CONSTRAINT ck_inventario_costo
        CHECK (costo_unitario IS NULL OR costo_unitario >= 0)
);

-- =========================================================
-- TABLA PRINCIPAL: MOVIMIENTOS
-- =========================================================

CREATE TABLE movimientos (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha                   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo_movimiento_id      BIGINT NOT NULL REFERENCES tipos_movimiento(id),
    inventario_id           BIGINT NOT NULL REFERENCES inventario(id),

    cantidad                NUMERIC(14,3) NOT NULL,
    stock_anterior          NUMERIC(14,3),
    stock_posterior         NUMERIC(14,3),

    ubicacion_origen_id     BIGINT REFERENCES ubicaciones(id),
    ubicacion_destino_id    BIGINT REFERENCES ubicaciones(id),

    responsable             VARCHAR(150),
    motivo                  TEXT,
    documento               VARCHAR(150),
    observaciones           TEXT,

    anulado                 BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ck_movimiento_cantidad
        CHECK (cantidad > 0),

    CONSTRAINT ck_movimiento_ubicaciones
        CHECK (
            ubicacion_origen_id IS NULL
            OR ubicacion_destino_id IS NULL
            OR ubicacion_origen_id <> ubicacion_destino_id
        )
);

-- =========================================================
-- INDICES
-- =========================================================

CREATE INDEX idx_inventario_descripcion
    ON inventario (descripcion);

CREATE INDEX idx_inventario_categoria
    ON inventario (categoria_id);

CREATE INDEX idx_inventario_ubicacion
    ON inventario (ubicacion_id);

CREATE INDEX idx_movimientos_fecha
    ON movimientos (fecha);

CREATE INDEX idx_movimientos_inventario
    ON movimientos (inventario_id);

CREATE INDEX idx_movimientos_tipo
    ON movimientos (tipo_movimiento_id);

-- =========================================================
-- DATOS INICIALES: CATEGORIAS DEL EXCEL
-- =========================================================

INSERT INTO categorias (nombre) VALUES
    ('AGUA'),
    ('CONSTRUCCION'),
    ('ELECTRICO'),
    ('ELEMENTO DE SUJECION'),
    ('EPPS'),
    ('EQUIPO'),
    ('FERRETERIA'),
    ('HERRAMIENTA'),
    ('INDUMENTARIA'),
    ('MOCHILA'),
    ('RED Y TELECOMUNICACION'),
    ('SEÑALETICA'),
    ('TUBO')
ON CONFLICT (nombre) DO NOTHING;

-- =========================================================
-- DATOS INICIALES: UNIDADES DEL EXCEL
-- =========================================================

INSERT INTO unidades_medida (codigo, nombre, permite_decimal) VALUES
    ('UND',    'Unidad',     FALSE),
    ('MTRS',   'Metros',     TRUE),
    ('PAR',    'Par',        FALSE),
    ('KIT',    'Kit',        FALSE),
    ('BOLSAS', 'Bolsas',     FALSE),
    ('ROLLO',  'Rollo',      TRUE),
    ('CM',     'Centimetros', TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================
-- CONDICIONES INICIALES
-- =========================================================

INSERT INTO condiciones (nombre) VALUES
    ('NUEVO'),
    ('USADO'),
    ('MALOGRADO')
ON CONFLICT (nombre) DO NOTHING;

-- =========================================================
-- TIPOS DE MOVIMIENTO INICIALES
-- =========================================================

INSERT INTO tipos_movimiento (
    codigo,
    nombre,
    signo_stock,
    requiere_origen,
    requiere_destino
) VALUES
    ('ENTRADA', 'Entrada', 1, FALSE, TRUE),
    ('SALIDA', 'Salida', -1, TRUE, FALSE),
    ('AJUSTE_POSITIVO', 'Ajuste positivo', 1, FALSE, FALSE),
    ('AJUSTE_NEGATIVO', 'Ajuste negativo', -1, FALSE, FALSE),
    ('TRASLADO', 'Traslado', NULL, TRUE, TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- =========================================================
-- ALMACEN Y UBICACIONES DE LIMA
-- =========================================================

INSERT INTO almacenes (nombre, descripcion)
VALUES ('ALMACEN LIMA', 'Almacen principal de Lima')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO ubicaciones (almacen_id, codigo)
SELECT a.id, u.codigo
FROM almacenes a
CROSS JOIN (
    VALUES
        ('A-001'),
        ('A-003'),
        ('A-004'),
        ('A-005'),
        ('B-001'),
        ('B-002'),
        ('B-003'),
        ('B-004'),
        ('B-005'),
        ('C-001'),
        ('C-002'),
        ('C-003'),
        ('C-004'),
        ('C-005'),
        ('D-003'),
        ('AZOTEA')
) AS u(codigo)
WHERE a.nombre = 'ALMACEN LIMA'
ON CONFLICT (almacen_id, codigo) DO NOTHING;

COMMIT;

-- Verificacion opcional despues de ejecutar la migracion:
--
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;

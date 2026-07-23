from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CatalogoBase(ORMModel):
    id: int
    nombre: str
    descripcion: str | None = None
    activo: bool


class UnidadOut(CatalogoBase):
    codigo: str
    permite_decimal: bool


class AlmacenOut(ORMModel):
    id: int
    nombre: str
    activo: bool


class UbicacionOut(ORMModel):
    id: int
    codigo: str
    descripcion: str | None = None
    activo: bool
    almacen: AlmacenOut


class TipoMovimientoOut(ORMModel):
    id: int
    codigo: str
    nombre: str
    signo_stock: int | None
    requiere_origen: bool
    requiere_destino: bool
    activo: bool


class InventarioOut(ORMModel):
    id: int
    codigo: str
    descripcion: str
    categoria_id: int
    unidad_medida_id: int
    ubicacion_id: int
    condicion_id: int | None
    stock_actual: Decimal
    stock_minimo: Decimal | None
    costo_unitario: Decimal | None
    fecha_ultima_entrada: date | None
    fecha_ultima_salida: date | None
    calibracion: str | None
    fecha_calibracion: date | None
    marca: str | None
    modelo: str | None
    numero_serie: str | None
    codigo_patrimonial: str | None
    observaciones: str | None
    activo: bool
    categoria: CatalogoBase
    unidad_medida: UnidadOut
    ubicacion: UbicacionOut
    condicion: CatalogoBase | None


class InventarioCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=50)
    descripcion: str = Field(min_length=1)
    categoria_id: int
    unidad_medida_id: int
    ubicacion_id: int
    condicion_id: int | None = None
    stock_actual: Decimal = Field(default=0, ge=0, decimal_places=3)
    stock_minimo: Decimal | None = Field(default=None, ge=0, decimal_places=3)
    costo_unitario: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    fecha_ultima_entrada: date | None = None
    fecha_ultima_salida: date | None = None
    calibracion: Literal["NO_CUMPLE", "SIN_CALIBRAR", "CALIBRADO"] | None = None
    fecha_calibracion: date | None = None
    marca: str | None = Field(default=None, max_length=100)
    modelo: str | None = Field(default=None, max_length=100)
    numero_serie: str | None = Field(default=None, max_length=120)
    codigo_patrimonial: str | None = Field(default=None, max_length=120)
    observaciones: str | None = None
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def normalizar_codigo(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("descripcion")
    @classmethod
    def limpiar_descripcion(cls, value: str) -> str:
        return " ".join(value.split())


class InventarioUpdate(InventarioCreate):
    pass


class MovimientoOut(ORMModel):
    id: int
    fecha: datetime
    cantidad: Decimal
    stock_anterior: Decimal | None
    stock_posterior: Decimal | None
    responsable: str | None
    motivo: str | None
    documento: str | None
    observaciones: str | None
    anulado: bool
    tipo_movimiento: TipoMovimientoOut
    inventario: InventarioOut
    ubicacion_origen: UbicacionOut | None
    ubicacion_destino: UbicacionOut | None


class MovimientoCreate(BaseModel):
    fecha: datetime
    tipo_movimiento_id: int
    inventario_id: int
    cantidad: Decimal = Field(gt=0, decimal_places=3)
    ubicacion_origen_id: int | None = None
    ubicacion_destino_id: int | None = None
    responsable: str | None = Field(default=None, max_length=150)
    motivo: str | None = None
    documento: str | None = Field(default=None, max_length=150)
    observaciones: str | None = None


class CatalogoCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=100)
    descripcion: str | None = None
    activo: bool = True

    @field_validator("nombre")
    @classmethod
    def normalizar_nombre(cls, value: str) -> str:
        return " ".join(value.split()).upper()


class UnidadCreate(CatalogoCreate):
    codigo: str = Field(min_length=1, max_length=20)
    permite_decimal: bool = False

    @field_validator("codigo")
    @classmethod
    def normalizar_codigo(cls, value: str) -> str:
        return value.strip().upper()


class UbicacionCreate(BaseModel):
    almacen_id: int
    codigo: str = Field(min_length=1, max_length=50)
    descripcion: str | None = None
    activo: bool = True

    @field_validator("codigo")
    @classmethod
    def normalizar_codigo(cls, value: str) -> str:
        return value.strip().upper()


class PaginatedInventario(BaseModel):
    items: list[InventarioOut]
    total: int
    page: int
    page_size: int
    pages: int


class PaginatedMovimientos(BaseModel):
    items: list[MovimientoOut]
    total: int
    page: int
    page_size: int
    pages: int


EstadoSolicitud = Literal["ESPERA_APROBACION", "EN_CAMINO", "RECIBIDO"]
EstadoCalibracion = Literal["NO_CUMPLE", "SIN_CALIBRAR", "CALIBRADO"]


class SolicitudEquipoDetalleCreate(BaseModel):
    nombre_equipo: str = Field(min_length=2, max_length=250)
    marca: str | None = Field(default=None, max_length=100)
    modelo: str | None = Field(default=None, max_length=100)
    numero_serie: str | None = Field(default=None, max_length=120)
    codigo_patrimonial: str | None = Field(default=None, max_length=120)
    unidad_medida_id: int
    cantidad: int = Field(ge=1)
    condicion_salida_id: int | None = None
    calibracion_salida: EstadoCalibracion
    fecha_calibracion_salida: date | None = None
    observaciones: str | None = None

    @field_validator(
        "nombre_equipo",
        "marca",
        "modelo",
        "numero_serie",
        "codigo_patrimonial",
        "observaciones",
        mode="before",
    )
    @classmethod
    def limpiar_texto(cls, value: str | None) -> str | None:
        if value is None:
            return None
        limpio = " ".join(value.split())
        return limpio or None

    @model_validator(mode="after")
    def validar_calibracion(self):
        if self.calibracion_salida == "CALIBRADO" and self.fecha_calibracion_salida is None:
            raise ValueError("Indique la fecha de calibración del equipo.")
        return self


class SolicitudEquipoCreate(BaseModel):
    ubicacion_origen_id: int
    ubicacion_destino_id: int
    fecha_envio: datetime
    guia: str | None = Field(default=None, max_length=150)
    transportista: str | None = Field(default=None, max_length=150)
    solicitante_usuario_id: int | None = None
    solicitante_nombre: str = Field(min_length=1, max_length=150)
    observaciones_salida: str | None = None
    detalles: list[SolicitudEquipoDetalleCreate] = Field(min_length=1)


class SolicitudTransicion(BaseModel):
    usuario_id: int | None = None
    usuario_nombre: str = Field(min_length=1, max_length=150)
    comentario: str | None = None


class SolicitudRecepcionDetalle(BaseModel):
    detalle_id: int
    accion_inventario: Literal["CREAR", "VINCULAR"] = "CREAR"
    inventario_id: int | None = None
    codigo_inventario: str | None = Field(default=None, max_length=50)
    condicion_recepcion_id: int | None = None
    calibracion_recepcion: EstadoCalibracion | None = None
    fecha_calibracion_recepcion: date | None = None

    @field_validator("codigo_inventario")
    @classmethod
    def normalizar_codigo(cls, value: str | None) -> str | None:
        return value.strip().upper() if value and value.strip() else None

    @model_validator(mode="after")
    def validar_destino(self):
        if self.accion_inventario == "VINCULAR" and self.inventario_id is None:
            raise ValueError("Seleccione el artículo de inventario que desea vincular.")
        if self.calibracion_recepcion == "CALIBRADO" and self.fecha_calibracion_recepcion is None:
            raise ValueError("Indique la fecha de calibración observada en recepción.")
        return self


class SolicitudRecepcion(SolicitudTransicion):
    detalles: list[SolicitudRecepcionDetalle] = Field(default_factory=list)


class SolicitudEquipoDetalleOut(ORMModel):
    id: int
    nombre_equipo: str
    marca: str | None
    modelo: str | None
    numero_serie: str | None
    codigo_patrimonial: str | None
    cantidad: int
    calibracion_salida: str | None
    fecha_calibracion_salida: date | None
    calibracion_recepcion: str | None
    fecha_calibracion_recepcion: date | None
    observaciones: str | None
    inventario: InventarioOut | None
    unidad_medida: UnidadOut
    condicion_salida: CatalogoBase | None
    condicion_recepcion: CatalogoBase | None


class SolicitudEquipoHistorialOut(ORMModel):
    id: int
    estado_anterior: str | None
    estado_nuevo: str
    usuario_id: int | None
    usuario_nombre: str
    comentario: str | None
    creado_en: datetime


class SolicitudEquipoArchivoOut(ORMModel):
    id: int
    tipo: Literal["DOCUMENTO", "FIRMA_REMITENTE", "FIRMA_RECEPTOR"]
    nombre_original: str
    mime_type: str
    tamano_bytes: int
    sha256: str
    subido_por_nombre: str
    creado_en: datetime


class SolicitudEquipoOut(ORMModel):
    id: int
    codigo: str
    estado: EstadoSolicitud
    fecha_envio: datetime
    guia: str | None
    transportista: str | None
    solicitante_usuario_id: int | None
    solicitante_nombre: str
    aprobado_por_nombre: str | None
    fecha_aprobacion: datetime | None
    recibido_por_nombre: str | None
    fecha_recepcion: datetime | None
    observaciones_salida: str | None
    observaciones_recepcion: str | None
    creado_en: datetime
    ubicacion_origen: UbicacionOut
    ubicacion_destino: UbicacionOut
    detalles: list[SolicitudEquipoDetalleOut]
    historial: list[SolicitudEquipoHistorialOut]
    archivos: list[SolicitudEquipoArchivoOut]


class PaginatedSolicitudes(BaseModel):
    items: list[SolicitudEquipoOut]
    total: int
    page: int
    page_size: int
    pages: int


class DashboardOut(BaseModel):
    articulos_activos: int
    categorias_activas: int
    ubicaciones_activas: int
    stock_bajo: int
    movimientos_recientes: list[MovimientoOut]
    alertas_stock: list[InventarioOut]

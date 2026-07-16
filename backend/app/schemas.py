from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class DashboardOut(BaseModel):
    articulos_activos: int
    categorias_activas: int
    ubicaciones_activas: int
    stock_bajo: int
    movimientos_recientes: list[MovimientoOut]
    alertas_stock: list[InventarioOut]

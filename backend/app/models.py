from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Categoria(Base):
    __tablename__ = "categorias"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UnidadMedida(Base):
    __tablename__ = "unidades_medida"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    nombre: Mapped[str] = mapped_column(String(100))
    permite_decimal: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Almacen(Base):
    __tablename__ = "almacenes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Ubicacion(Base):
    __tablename__ = "ubicaciones"
    __table_args__ = (UniqueConstraint("almacen_id", "codigo"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    almacen_id: Mapped[int] = mapped_column(ForeignKey("almacenes.id"))
    codigo: Mapped[str] = mapped_column(String(50))
    descripcion: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    almacen: Mapped[Almacen] = relationship(lazy="joined")


class Condicion(Base):
    __tablename__ = "condiciones"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(50), unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TipoMovimiento(Base):
    __tablename__ = "tipos_movimiento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True)
    nombre: Mapped[str] = mapped_column(String(100))
    signo_stock: Mapped[int | None] = mapped_column(SmallInteger)
    requiere_origen: Mapped[bool] = mapped_column(Boolean, default=False)
    requiere_destino: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Inventario(Base):
    __tablename__ = "inventario"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(50), unique=True)
    descripcion: Mapped[str] = mapped_column(Text)
    categoria_id: Mapped[int] = mapped_column(ForeignKey("categorias.id"))
    unidad_medida_id: Mapped[int] = mapped_column(ForeignKey("unidades_medida.id"))
    ubicacion_id: Mapped[int] = mapped_column(ForeignKey("ubicaciones.id"))
    condicion_id: Mapped[int | None] = mapped_column(ForeignKey("condiciones.id"))
    stock_actual: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    stock_minimo: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    costo_unitario: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    fecha_ultima_entrada: Mapped[date | None] = mapped_column(Date)
    fecha_ultima_salida: Mapped[date | None] = mapped_column(Date)
    observaciones: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    categoria: Mapped[Categoria] = relationship(lazy="joined")
    unidad_medida: Mapped[UnidadMedida] = relationship(lazy="joined")
    ubicacion: Mapped[Ubicacion] = relationship(lazy="joined")
    condicion: Mapped[Condicion | None] = relationship(lazy="joined")


class Movimiento(Base):
    __tablename__ = "movimientos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    tipo_movimiento_id: Mapped[int] = mapped_column(ForeignKey("tipos_movimiento.id"))
    inventario_id: Mapped[int] = mapped_column(ForeignKey("inventario.id"))
    cantidad: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    stock_anterior: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    stock_posterior: Mapped[Decimal | None] = mapped_column(Numeric(14, 3))
    ubicacion_origen_id: Mapped[int | None] = mapped_column(ForeignKey("ubicaciones.id"))
    ubicacion_destino_id: Mapped[int | None] = mapped_column(ForeignKey("ubicaciones.id"))
    responsable: Mapped[str | None] = mapped_column(String(150))
    motivo: Mapped[str | None] = mapped_column(Text)
    documento: Mapped[str | None] = mapped_column(String(150))
    observaciones: Mapped[str | None] = mapped_column(Text)
    anulado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tipo_movimiento: Mapped[TipoMovimiento] = relationship(lazy="joined")
    inventario: Mapped[Inventario] = relationship(lazy="joined")
    ubicacion_origen: Mapped[Ubicacion | None] = relationship(
        foreign_keys=[ubicacion_origen_id], lazy="joined"
    )
    ubicacion_destino: Mapped[Ubicacion | None] = relationship(
        foreign_keys=[ubicacion_destino_id], lazy="joined"
    )

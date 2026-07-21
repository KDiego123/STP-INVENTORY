from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
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

    almacen: Mapped[Almacen] = relationship(lazy="selectin")


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
    calibracion: Mapped[str | None] = mapped_column(String(20))
    fecha_calibracion: Mapped[date | None] = mapped_column(Date)
    observaciones: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    categoria: Mapped[Categoria] = relationship(lazy="selectin")
    unidad_medida: Mapped[UnidadMedida] = relationship(lazy="selectin")
    ubicacion: Mapped[Ubicacion] = relationship(lazy="selectin")
    condicion: Mapped[Condicion | None] = relationship(lazy="selectin")


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

    tipo_movimiento: Mapped[TipoMovimiento] = relationship(lazy="selectin")
    inventario: Mapped[Inventario] = relationship(lazy="selectin")
    ubicacion_origen: Mapped[Ubicacion | None] = relationship(
        foreign_keys=[ubicacion_origen_id], lazy="selectin"
    )
    ubicacion_destino: Mapped[Ubicacion | None] = relationship(
        foreign_keys=[ubicacion_destino_id], lazy="selectin"
    )


class SolicitudEquipo(Base):
    __tablename__ = "solicitudes_equipos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True)
    estado: Mapped[str] = mapped_column(String(30), default="ESPERA_APROBACION")
    ubicacion_origen_id: Mapped[int] = mapped_column(ForeignKey("ubicaciones.id"))
    ubicacion_destino_id: Mapped[int] = mapped_column(ForeignKey("ubicaciones.id"))
    fecha_envio: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    guia: Mapped[str | None] = mapped_column(String(150))
    transportista: Mapped[str | None] = mapped_column(String(150))
    solicitante_usuario_id: Mapped[int | None] = mapped_column(BigInteger)
    solicitante_nombre: Mapped[str] = mapped_column(String(150))
    aprobado_por_usuario_id: Mapped[int | None] = mapped_column(BigInteger)
    aprobado_por_nombre: Mapped[str | None] = mapped_column(String(150))
    fecha_aprobacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recibido_por_usuario_id: Mapped[int | None] = mapped_column(BigInteger)
    recibido_por_nombre: Mapped[str | None] = mapped_column(String(150))
    fecha_recepcion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observaciones_salida: Mapped[str | None] = mapped_column(Text)
    observaciones_recepcion: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    ubicacion_origen: Mapped[Ubicacion] = relationship(foreign_keys=[ubicacion_origen_id], lazy="selectin")
    ubicacion_destino: Mapped[Ubicacion] = relationship(foreign_keys=[ubicacion_destino_id], lazy="selectin")
    detalles: Mapped[list["SolicitudEquipoDetalle"]] = relationship(lazy="selectin", cascade="all, delete-orphan")
    historial: Mapped[list["SolicitudEquipoHistorial"]] = relationship(lazy="selectin", cascade="all, delete-orphan")


class SolicitudEquipoDetalle(Base):
    __tablename__ = "solicitudes_equipos_detalle"
    __table_args__ = (CheckConstraint("cantidad > 0", name="solicitud_equipo_cantidad_positiva"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    solicitud_id: Mapped[int] = mapped_column(ForeignKey("solicitudes_equipos.id", ondelete="CASCADE"))
    inventario_id: Mapped[int] = mapped_column(ForeignKey("inventario.id"))
    cantidad: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    condicion_salida_id: Mapped[int | None] = mapped_column(ForeignKey("condiciones.id"))
    calibracion_salida: Mapped[str | None] = mapped_column(String(20))
    condicion_recepcion_id: Mapped[int | None] = mapped_column(ForeignKey("condiciones.id"))
    calibracion_recepcion: Mapped[str | None] = mapped_column(String(20))
    observaciones: Mapped[str | None] = mapped_column(Text)

    inventario: Mapped[Inventario] = relationship(lazy="selectin")
    condicion_salida: Mapped[Condicion | None] = relationship(foreign_keys=[condicion_salida_id], lazy="selectin")
    condicion_recepcion: Mapped[Condicion | None] = relationship(foreign_keys=[condicion_recepcion_id], lazy="selectin")


class SolicitudEquipoHistorial(Base):
    __tablename__ = "solicitudes_equipos_historial"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    solicitud_id: Mapped[int] = mapped_column(ForeignKey("solicitudes_equipos.id", ondelete="CASCADE"))
    estado_anterior: Mapped[str | None] = mapped_column(String(30))
    estado_nuevo: Mapped[str] = mapped_column(String(30))
    usuario_id: Mapped[int | None] = mapped_column(BigInteger)
    usuario_nombre: Mapped[str] = mapped_column(String(150))
    comentario: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

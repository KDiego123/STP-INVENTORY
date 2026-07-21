from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import (
    Almacen,
    Categoria,
    Condicion,
    Inventario,
    Movimiento,
    SolicitudEquipo,
    SolicitudEquipoDetalle,
    SolicitudEquipoHistorial,
    TipoMovimiento,
    Ubicacion,
    UnidadMedida,
)
from .schemas import (
    CatalogoBase,
    CatalogoCreate,
    DashboardOut,
    InventarioCreate,
    InventarioOut,
    InventarioUpdate,
    MovimientoCreate,
    MovimientoOut,
    PaginatedInventario,
    PaginatedMovimientos,
    PaginatedSolicitudes,
    SolicitudEquipoCreate,
    SolicitudEquipoOut,
    SolicitudRecepcion,
    SolicitudTransicion,
    TipoMovimientoOut,
    UbicacionCreate,
    UbicacionOut,
    UnidadCreate,
    UnidadOut,
)


app = FastAPI(
    title="API Inventario Lima",
    version="0.1.0",
    description="API administrativa. La autenticación se incorporará en una fase posterior.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.frontend_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB = Annotated[Session, Depends(get_db)]


def _error_integridad(exc: IntegrityError):
    detalle = str(exc.orig).lower()
    if "unique" in detalle or "duplic" in detalle:
        raise HTTPException(status_code=409, detail="Ya existe un registro con esos datos.")
    if "foreign key" in detalle or "llave foránea" in detalle:
        raise HTTPException(
            status_code=409,
            detail="El registro está relacionado con otros datos y no puede modificarse así.",
        )
    raise HTTPException(status_code=400, detail="Los datos no cumplen las reglas de la base.")


def _obtener(db: Session, modelo, pk: int, nombre: str):
    registro = db.get(modelo, pk)
    if registro is None:
        raise HTTPException(status_code=404, detail=f"{nombre} no encontrado.")
    return registro


def _validar_catalogos_inventario(db: Session, datos: InventarioCreate):
    categoria = _obtener(db, Categoria, datos.categoria_id, "Categoría")
    unidad = _obtener(db, UnidadMedida, datos.unidad_medida_id, "Unidad")
    ubicacion = _obtener(db, Ubicacion, datos.ubicacion_id, "Ubicación")
    if not categoria.activo or not unidad.activo or not ubicacion.activo:
        raise HTTPException(status_code=400, detail="Seleccione catálogos activos.")
    es_equipo = categoria.nombre.strip().upper() == "EQUIPOS"
    if es_equipo and datos.calibracion is None:
        raise HTTPException(status_code=400, detail="Seleccione el estado de calibración del equipo.")
    if es_equipo and datos.calibracion == "CALIBRADO" and datos.fecha_calibracion is None:
        raise HTTPException(status_code=400, detail="Indique la fecha de calibración del equipo.")
    if not es_equipo and datos.calibracion is not None:
        raise HTTPException(status_code=400, detail="La calibración solo corresponde a la categoría EQUIPOS.")
    if not es_equipo and datos.fecha_calibracion is not None:
        raise HTTPException(status_code=400, detail="La fecha de calibración solo corresponde a la categoría EQUIPOS.")
    if datos.condicion_id is not None:
        condicion = _obtener(db, Condicion, datos.condicion_id, "Condición")
        if not condicion.activo:
            raise HTTPException(status_code=400, detail="Seleccione una condición activa.")
    if not unidad.permite_decimal and datos.stock_actual != datos.stock_actual.to_integral_value():
        raise HTTPException(
            status_code=400,
            detail=f"La unidad {unidad.codigo} no admite cantidades decimales.",
        )


@app.get("/api/health")
def health(db: DB):
    database = db.execute(select(func.current_database())).scalar_one()
    return {
        "status": "ok",
        "database": database,
        "auth_enabled": settings.auth_enabled,
    }


@app.get("/api/dashboard", response_model=DashboardOut)
def dashboard(db: DB):
    articulos = db.scalar(select(func.count()).select_from(Inventario).where(Inventario.activo))
    categorias = db.scalar(select(func.count()).select_from(Categoria).where(Categoria.activo))
    ubicaciones = db.scalar(select(func.count()).select_from(Ubicacion).where(Ubicacion.activo))
    filtro_bajo = (
        Inventario.activo,
        Inventario.stock_minimo.is_not(None),
        Inventario.stock_actual <= Inventario.stock_minimo,
    )
    stock_bajo = db.scalar(select(func.count()).select_from(Inventario).where(*filtro_bajo))
    recientes = db.scalars(
        select(Movimiento).order_by(Movimiento.fecha.desc(), Movimiento.id.desc()).limit(8)
    ).unique().all()
    alertas = db.scalars(
        select(Inventario).where(*filtro_bajo).order_by(Inventario.stock_actual).limit(6)
    ).unique().all()
    return DashboardOut(
        articulos_activos=articulos or 0,
        categorias_activas=categorias or 0,
        ubicaciones_activas=ubicaciones or 0,
        stock_bajo=stock_bajo or 0,
        movimientos_recientes=recientes,
        alertas_stock=alertas,
    )


@app.get("/api/inventario", response_model=PaginatedInventario)
def inventario_listar(
    db: DB,
    q: str = "",
    categoria_id: int | None = None,
    ubicacion_id: int | None = None,
    estado: Literal["activos", "inactivos", "todos", "bajo"] = "activos",
    orden: Literal["desc", "asc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=500),
):
    filtros = []
    if q.strip():
        patron = f"%{q.strip()}%"
        filtros.append(
            or_(
                Inventario.codigo.ilike(patron),
                Inventario.descripcion.ilike(patron),
                Inventario.observaciones.ilike(patron),
            )
        )
    if categoria_id:
        filtros.append(Inventario.categoria_id == categoria_id)
    if ubicacion_id:
        filtros.append(Inventario.ubicacion_id == ubicacion_id)
    if estado == "activos":
        filtros.append(Inventario.activo)
    elif estado == "inactivos":
        filtros.append(Inventario.activo.is_(False))
    elif estado == "bajo":
        filtros.extend(
            [
                Inventario.activo,
                Inventario.stock_minimo.is_not(None),
                Inventario.stock_actual <= Inventario.stock_minimo,
            ]
        )

    total = db.scalar(select(func.count()).select_from(Inventario).where(*filtros)) or 0
    criterio_id = Inventario.id.asc() if orden == "asc" else Inventario.id.desc()
    items = db.scalars(
        select(Inventario)
        .where(*filtros)
        .order_by(criterio_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return PaginatedInventario(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@app.get("/api/inventario/siguiente-codigo")
def inventario_siguiente_codigo(db: DB):
    codigos = db.scalars(
        select(Inventario.codigo).where(Inventario.codigo.like("LIMA-%"))
    ).all()
    numeros = []
    for codigo in codigos:
        sufijo = codigo.removeprefix("LIMA-")
        if sufijo.isdigit():
            numeros.append(int(sufijo))
    return {"codigo": f"LIMA-{max(numeros, default=0) + 1:04d}"}


@app.get("/api/inventario/{pk}", response_model=InventarioOut)
def inventario_detalle(pk: int, db: DB):
    return _obtener(db, Inventario, pk, "Artículo")


@app.post("/api/inventario", response_model=InventarioOut, status_code=status.HTTP_201_CREATED)
def inventario_crear(datos: InventarioCreate, db: DB):
    _validar_catalogos_inventario(db, datos)
    registro = Inventario(**datos.model_dump(), actualizado_en=datetime.now(timezone.utc))
    db.add(registro)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _error_integridad(exc)
    db.refresh(registro)
    return registro


@app.put("/api/inventario/{pk}", response_model=InventarioOut)
def inventario_editar(pk: int, datos: InventarioUpdate, db: DB):
    registro = _obtener(db, Inventario, pk, "Artículo")
    _validar_catalogos_inventario(db, datos)
    for campo, valor in datos.model_dump().items():
        setattr(registro, campo, valor)
    registro.actualizado_en = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _error_integridad(exc)
    db.refresh(registro)
    return registro


@app.patch("/api/inventario/{pk}/estado", response_model=InventarioOut)
def inventario_estado(pk: int, db: DB):
    registro = _obtener(db, Inventario, pk, "Artículo")
    registro.activo = not registro.activo
    registro.actualizado_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(registro)
    return registro


@app.get("/api/movimientos", response_model=PaginatedMovimientos)
def movimientos_listar(
    db: DB,
    q: str = "",
    tipo_id: int | None = None,
    estado: Literal["vigentes", "anulados", "todos"] = "vigentes",
    orden: Literal["desc", "asc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
):
    filtros = []
    if q.strip():
        patron = f"%{q.strip()}%"
        filtros.append(
            or_(
                Inventario.codigo.ilike(patron),
                Inventario.descripcion.ilike(patron),
                Movimiento.documento.ilike(patron),
                Movimiento.responsable.ilike(patron),
            )
        )
    if tipo_id:
        filtros.append(Movimiento.tipo_movimiento_id == tipo_id)
    if estado == "vigentes":
        filtros.append(Movimiento.anulado.is_(False))
    elif estado == "anulados":
        filtros.append(Movimiento.anulado)

    base = select(Movimiento).join(Movimiento.inventario).where(*filtros)
    total = db.scalar(
        select(func.count()).select_from(Movimiento).join(Movimiento.inventario).where(*filtros)
    ) or 0
    criterio_fecha = Movimiento.fecha.asc() if orden == "asc" else Movimiento.fecha.desc()
    criterio_id = Movimiento.id.asc() if orden == "asc" else Movimiento.id.desc()
    items = db.scalars(
        base.order_by(criterio_fecha, criterio_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return PaginatedMovimientos(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@app.get("/api/movimientos/{pk}", response_model=MovimientoOut)
def movimiento_detalle(pk: int, db: DB):
    return _obtener(db, Movimiento, pk, "Movimiento")


@app.post("/api/movimientos", response_model=MovimientoOut, status_code=status.HTTP_201_CREATED)
def movimiento_crear(datos: MovimientoCreate, db: DB):
    try:
        inventario = db.scalar(
            select(Inventario).where(Inventario.id == datos.inventario_id).with_for_update()
        )
        if inventario is None or not inventario.activo:
            raise HTTPException(status_code=404, detail="Artículo activo no encontrado.")
        tipo = _obtener(db, TipoMovimiento, datos.tipo_movimiento_id, "Tipo de movimiento")
        if not tipo.activo:
            raise HTTPException(status_code=400, detail="El tipo de movimiento está inactivo.")
        if not inventario.unidad_medida.permite_decimal and datos.cantidad != datos.cantidad.to_integral_value():
            raise HTTPException(
                status_code=400,
                detail=f"La unidad {inventario.unidad_medida.codigo} no admite decimales.",
            )

        origen = datos.ubicacion_origen_id
        destino = datos.ubicacion_destino_id
        if tipo.requiere_origen and origen is None:
            raise HTTPException(status_code=400, detail="Seleccione una ubicación de origen.")
        if tipo.requiere_destino and destino is None:
            raise HTTPException(status_code=400, detail="Seleccione una ubicación de destino.")
        if origen is not None and origen != inventario.ubicacion_id:
            raise HTTPException(
                status_code=409,
                detail=f"La ubicación actual del artículo es {inventario.ubicacion.codigo}.",
            )
        if destino is not None:
            _obtener(db, Ubicacion, destino, "Ubicación de destino")

        stock_anterior = inventario.stock_actual
        stock_posterior = stock_anterior
        if tipo.signo_stock == 1:
            if tipo.codigo == "ENTRADA" and destino not in (None, inventario.ubicacion_id):
                raise HTTPException(
                    status_code=409,
                    detail="La entrada debe usar la ubicación actual. Use un traslado para cambiarla.",
                )
            stock_posterior += datos.cantidad
            if tipo.codigo == "ENTRADA":
                inventario.fecha_ultima_entrada = datos.fecha.date()
            destino = destino or inventario.ubicacion_id
        elif tipo.signo_stock == -1:
            if datos.cantidad > stock_anterior:
                raise HTTPException(
                    status_code=409,
                    detail=f"Stock insuficiente. Disponible: {stock_anterior}.",
                )
            stock_posterior -= datos.cantidad
            if tipo.codigo == "SALIDA":
                inventario.fecha_ultima_salida = datos.fecha.date()
            origen = origen or inventario.ubicacion_id
        elif tipo.codigo == "TRASLADO":
            if origen is None or destino is None or origen == destino:
                raise HTTPException(
                    status_code=400,
                    detail="El traslado requiere origen y destino diferentes.",
                )
            inventario.ubicacion_id = destino
        else:
            raise HTTPException(
                status_code=400,
                detail="El tipo de movimiento no tiene una operación configurada.",
            )

        inventario.stock_actual = stock_posterior
        inventario.actualizado_en = datetime.now(timezone.utc)
        movimiento = Movimiento(
            **datos.model_dump(exclude={"ubicacion_origen_id", "ubicacion_destino_id"}),
            ubicacion_origen_id=origen,
            ubicacion_destino_id=destino,
            stock_anterior=stock_anterior,
            stock_posterior=stock_posterior,
            anulado=False,
        )
        db.add(movimiento)
        db.commit()
        db.refresh(movimiento)
        return movimiento
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        _error_integridad(exc)


@app.post("/api/movimientos/{pk}/anular", response_model=MovimientoOut)
def movimiento_anular(pk: int, db: DB):
    try:
        movimiento = db.scalar(
            select(Movimiento).where(Movimiento.id == pk).with_for_update()
        )
        if movimiento is None:
            raise HTTPException(status_code=404, detail="Movimiento no encontrado.")
        if movimiento.anulado:
            raise HTTPException(status_code=409, detail="El movimiento ya está anulado.")
        posterior = db.scalar(
            select(Movimiento.id)
            .where(
                Movimiento.inventario_id == movimiento.inventario_id,
                Movimiento.anulado.is_(False),
                or_(
                    Movimiento.fecha > movimiento.fecha,
                    (Movimiento.fecha == movimiento.fecha) & (Movimiento.id > movimiento.id),
                ),
            )
            .limit(1)
        )
        if posterior:
            raise HTTPException(
                status_code=409,
                detail="No se puede anular porque el artículo tiene movimientos posteriores.",
            )
        inventario = db.scalar(
            select(Inventario)
            .where(Inventario.id == movimiento.inventario_id)
            .with_for_update()
        )
        tipo = movimiento.tipo_movimiento
        if tipo.signo_stock == 1:
            nuevo = inventario.stock_actual - movimiento.cantidad
            if nuevo < Decimal("0"):
                raise HTTPException(status_code=409, detail="La anulación produciría stock negativo.")
            inventario.stock_actual = nuevo
        elif tipo.signo_stock == -1:
            inventario.stock_actual += movimiento.cantidad
        elif tipo.codigo == "TRASLADO":
            if inventario.ubicacion_id != movimiento.ubicacion_destino_id:
                raise HTTPException(status_code=409, detail="El artículo ya no está en el destino.")
            inventario.ubicacion_id = movimiento.ubicacion_origen_id
        movimiento.anulado = True
        inventario.actualizado_en = datetime.now(timezone.utc)
        db.commit()
        db.refresh(movimiento)
        return movimiento
    except HTTPException:
        db.rollback()
        raise


def _solicitud_codigo(db: Session) -> str:
    ultimo = db.scalar(select(func.max(SolicitudEquipo.id))) or 0
    return f"ENV-{datetime.now().year}-{ultimo + 1:05d}"


def _validar_detalle_equipo(db: Session, inventario_id: int, cantidad: Decimal):
    item = _obtener(db, Inventario, inventario_id, "Equipo")
    if item.categoria.nombre.strip().upper() != "EQUIPOS":
        raise HTTPException(status_code=400, detail=f"{item.codigo} no pertenece a la categoría EQUIPOS.")
    if not item.activo:
        raise HTTPException(status_code=400, detail=f"{item.codigo} está inactivo.")
    if cantidad > item.stock_actual:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente para {item.codigo}.")
    return item


@app.get("/api/solicitudes-equipos", response_model=PaginatedSolicitudes)
def solicitudes_listar(
    db: DB,
    estado: Literal["ESPERA_APROBACION", "EN_CAMINO", "RECIBIDO"] | None = None,
    solicitante: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
):
    filtros = []
    if estado:
        filtros.append(SolicitudEquipo.estado == estado)
    if solicitante.strip():
        filtros.append(SolicitudEquipo.solicitante_nombre == solicitante.strip())
    total = db.scalar(select(func.count()).select_from(SolicitudEquipo).where(*filtros)) or 0
    items = db.scalars(
        select(SolicitudEquipo)
        .where(*filtros)
        .order_by(SolicitudEquipo.creado_en.desc(), SolicitudEquipo.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return PaginatedSolicitudes(items=items, total=total, page=page, page_size=page_size, pages=max(1, ceil(total / page_size)))


@app.get("/api/solicitudes-equipos/{pk}", response_model=SolicitudEquipoOut)
def solicitud_detalle(pk: int, db: DB):
    return _obtener(db, SolicitudEquipo, pk, "Solicitud")


@app.post("/api/solicitudes-equipos", response_model=SolicitudEquipoOut, status_code=201)
def solicitud_crear(datos: SolicitudEquipoCreate, db: DB):
    if datos.ubicacion_origen_id == datos.ubicacion_destino_id:
        raise HTTPException(status_code=400, detail="El origen y el destino deben ser diferentes.")
    _obtener(db, Ubicacion, datos.ubicacion_origen_id, "Ubicación de origen")
    _obtener(db, Ubicacion, datos.ubicacion_destino_id, "Ubicación de destino")
    registro = SolicitudEquipo(
        codigo=_solicitud_codigo(db),
        estado="ESPERA_APROBACION",
        ubicacion_origen_id=datos.ubicacion_origen_id,
        ubicacion_destino_id=datos.ubicacion_destino_id,
        fecha_envio=datos.fecha_envio,
        guia=datos.guia.strip() if datos.guia else None,
        transportista=datos.transportista.strip() if datos.transportista else None,
        solicitante_usuario_id=datos.solicitante_usuario_id,
        solicitante_nombre=datos.solicitante_nombre.strip(),
        observaciones_salida=datos.observaciones_salida.strip() if datos.observaciones_salida else None,
        actualizado_en=datetime.now(timezone.utc),
    )
    for detalle in datos.detalles:
        item = _validar_detalle_equipo(db, detalle.inventario_id, detalle.cantidad)
        registro.detalles.append(SolicitudEquipoDetalle(
            inventario_id=item.id,
            cantidad=detalle.cantidad,
            condicion_salida_id=detalle.condicion_salida_id,
            calibracion_salida=detalle.calibracion_salida or item.calibracion,
            observaciones=detalle.observaciones.strip() if detalle.observaciones else None,
        ))
    registro.historial.append(SolicitudEquipoHistorial(
        estado_anterior=None,
        estado_nuevo="ESPERA_APROBACION",
        usuario_id=datos.solicitante_usuario_id,
        usuario_nombre=datos.solicitante_nombre.strip(),
        comentario="Solicitud registrada por almacén de mina.",
    ))
    db.add(registro)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _error_integridad(exc)
    db.refresh(registro)
    return registro


@app.post("/api/solicitudes-equipos/{pk}/aprobar", response_model=SolicitudEquipoOut)
def solicitud_aprobar(pk: int, datos: SolicitudTransicion, db: DB):
    registro = _obtener(db, SolicitudEquipo, pk, "Solicitud")
    if registro.estado != "ESPERA_APROBACION":
        raise HTTPException(status_code=409, detail="Solo se pueden aprobar solicitudes en espera.")
    ahora = datetime.now(timezone.utc)
    registro.estado = "EN_CAMINO"
    registro.aprobado_por_usuario_id = datos.usuario_id
    registro.aprobado_por_nombre = datos.usuario_nombre.strip()
    registro.fecha_aprobacion = ahora
    registro.actualizado_en = ahora
    registro.historial.append(SolicitudEquipoHistorial(
        estado_anterior="ESPERA_APROBACION", estado_nuevo="EN_CAMINO",
        usuario_id=datos.usuario_id, usuario_nombre=datos.usuario_nombre.strip(),
        comentario=datos.comentario.strip() if datos.comentario else "Solicitud aprobada por Logística Lima.",
    ))
    db.commit(); db.refresh(registro)
    return registro


@app.post("/api/solicitudes-equipos/{pk}/recibir", response_model=SolicitudEquipoOut)
def solicitud_recibir(pk: int, datos: SolicitudRecepcion, db: DB):
    registro = _obtener(db, SolicitudEquipo, pk, "Solicitud")
    if registro.estado != "EN_CAMINO":
        raise HTTPException(status_code=409, detail="Solo se pueden recibir solicitudes en camino.")
    detalles = {detalle.id: detalle for detalle in registro.detalles}
    for recibido in datos.detalles:
        detalle = detalles.get(recibido.detalle_id)
        if detalle is None:
            raise HTTPException(status_code=400, detail="El detalle recibido no pertenece a la solicitud.")
        detalle.condicion_recepcion_id = recibido.condicion_recepcion_id
        detalle.calibracion_recepcion = recibido.calibracion_recepcion
    ahora = datetime.now(timezone.utc)
    registro.estado = "RECIBIDO"
    registro.recibido_por_usuario_id = datos.usuario_id
    registro.recibido_por_nombre = datos.usuario_nombre.strip()
    registro.fecha_recepcion = ahora
    registro.observaciones_recepcion = datos.comentario.strip() if datos.comentario else None
    registro.actualizado_en = ahora
    registro.historial.append(SolicitudEquipoHistorial(
        estado_anterior="EN_CAMINO", estado_nuevo="RECIBIDO",
        usuario_id=datos.usuario_id, usuario_nombre=datos.usuario_nombre.strip(),
        comentario=datos.comentario.strip() if datos.comentario else "Equipo recibido en Lima.",
    ))
    db.commit(); db.refresh(registro)
    return registro


@app.get("/api/catalogos/categorias", response_model=list[CatalogoBase])
def categorias_listar(db: DB, todos: bool = False):
    query = select(Categoria).order_by(Categoria.nombre)
    if not todos:
        query = query.where(Categoria.activo)
    return db.scalars(query).all()


@app.post("/api/catalogos/categorias", response_model=CatalogoBase, status_code=201)
def categorias_crear(datos: CatalogoCreate, db: DB):
    return _catalogo_guardar(db, Categoria, datos)


@app.put("/api/catalogos/categorias/{pk}", response_model=CatalogoBase)
def categorias_editar(pk: int, datos: CatalogoCreate, db: DB):
    return _catalogo_guardar(db, Categoria, datos, pk)


@app.patch("/api/catalogos/categorias/{pk}/estado", response_model=CatalogoBase)
def categorias_estado(pk: int, db: DB):
    return _catalogo_estado(db, Categoria, pk, "Categoría")


@app.get("/api/catalogos/condiciones", response_model=list[CatalogoBase])
def condiciones_listar(db: DB, todos: bool = False):
    query = select(Condicion).order_by(Condicion.nombre)
    if not todos:
        query = query.where(Condicion.activo)
    return db.scalars(query).all()


@app.post("/api/catalogos/condiciones", response_model=CatalogoBase, status_code=201)
def condiciones_crear(datos: CatalogoCreate, db: DB):
    return _catalogo_guardar(db, Condicion, datos)


@app.put("/api/catalogos/condiciones/{pk}", response_model=CatalogoBase)
def condiciones_editar(pk: int, datos: CatalogoCreate, db: DB):
    return _catalogo_guardar(db, Condicion, datos, pk)


@app.patch("/api/catalogos/condiciones/{pk}/estado", response_model=CatalogoBase)
def condiciones_estado(pk: int, db: DB):
    return _catalogo_estado(db, Condicion, pk, "Condición")


@app.get("/api/catalogos/unidades", response_model=list[UnidadOut])
def unidades_listar(db: DB, todos: bool = False):
    query = select(UnidadMedida).order_by(UnidadMedida.nombre)
    if not todos:
        query = query.where(UnidadMedida.activo)
    return db.scalars(query).all()


@app.post("/api/catalogos/unidades", response_model=UnidadOut, status_code=201)
def unidades_crear(datos: UnidadCreate, db: DB):
    return _catalogo_guardar(db, UnidadMedida, datos)


@app.put("/api/catalogos/unidades/{pk}", response_model=UnidadOut)
def unidades_editar(pk: int, datos: UnidadCreate, db: DB):
    return _catalogo_guardar(db, UnidadMedida, datos, pk)


@app.patch("/api/catalogos/unidades/{pk}/estado", response_model=UnidadOut)
def unidades_estado(pk: int, db: DB):
    return _catalogo_estado(db, UnidadMedida, pk, "Unidad")


@app.get("/api/catalogos/ubicaciones", response_model=list[UbicacionOut])
def ubicaciones_listar(db: DB, todos: bool = False):
    query = select(Ubicacion).order_by(Ubicacion.codigo)
    if not todos:
        query = query.where(Ubicacion.activo)
    return db.scalars(query).unique().all()


@app.post("/api/catalogos/ubicaciones", response_model=UbicacionOut, status_code=201)
def ubicaciones_crear(datos: UbicacionCreate, db: DB):
    return _catalogo_guardar(db, Ubicacion, datos)


@app.put("/api/catalogos/ubicaciones/{pk}", response_model=UbicacionOut)
def ubicaciones_editar(pk: int, datos: UbicacionCreate, db: DB):
    return _catalogo_guardar(db, Ubicacion, datos, pk)


@app.patch("/api/catalogos/ubicaciones/{pk}/estado", response_model=UbicacionOut)
def ubicaciones_estado(pk: int, db: DB):
    return _catalogo_estado(db, Ubicacion, pk, "Ubicación")


@app.get("/api/catalogos/almacenes")
def almacenes_listar(db: DB):
    registros = db.scalars(select(Almacen).where(Almacen.activo).order_by(Almacen.nombre)).all()
    return [{"id": r.id, "nombre": r.nombre, "activo": r.activo} for r in registros]


@app.get("/api/catalogos/tipos-movimiento", response_model=list[TipoMovimientoOut])
def tipos_movimiento_listar(db: DB):
    return db.scalars(
        select(TipoMovimiento).where(TipoMovimiento.activo).order_by(TipoMovimiento.nombre)
    ).all()


def _catalogo_guardar(db: Session, modelo, datos, pk: int | None = None):
    registro = modelo() if pk is None else _obtener(db, modelo, pk, "Registro")
    for campo, valor in datos.model_dump().items():
        setattr(registro, campo, valor)
    if hasattr(registro, "actualizado_en"):
        registro.actualizado_en = datetime.now(timezone.utc)
    db.add(registro)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _error_integridad(exc)
    db.refresh(registro)
    return registro


def _catalogo_estado(db: Session, modelo, pk: int, nombre: str):
    registro = _obtener(db, modelo, pk, nombre)
    registro.activo = not registro.activo
    if hasattr(registro, "actualizado_en"):
        registro.actualizado_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(registro)
    return registro


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

export type Catalogo = {
  id: number
  nombre: string
  descripcion?: string | null
  activo: boolean
}

export type Unidad = Catalogo & {
  codigo: string
  permite_decimal: boolean
}

export type Almacen = { id: number; nombre: string; activo: boolean }

export type Ubicacion = {
  id: number
  codigo: string
  descripcion?: string | null
  activo: boolean
  almacen: Almacen
}

export type TipoMovimiento = {
  id: number
  codigo: string
  nombre: string
  signo_stock: number | null
  requiere_origen: boolean
  requiere_destino: boolean
  activo: boolean
}

export type Inventario = {
  id: number
  codigo: string
  descripcion: string
  categoria_id: number
  unidad_medida_id: number
  ubicacion_id: number
  condicion_id: number | null
  stock_actual: string
  stock_minimo: string | null
  costo_unitario: string | null
  fecha_ultima_entrada: string | null
  fecha_ultima_salida: string | null
  calibracion: 'NO_CUMPLE' | 'SIN_CALIBRAR' | 'CALIBRADO' | null
  fecha_calibracion: string | null
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  codigo_patrimonial: string | null
  observaciones: string | null
  activo: boolean
  categoria: Catalogo
  unidad_medida: Unidad
  ubicacion: Ubicacion
  condicion: Catalogo | null
}

export type Movimiento = {
  id: number
  fecha: string
  cantidad: string
  stock_anterior: string | null
  stock_posterior: string | null
  responsable: string | null
  motivo: string | null
  documento: string | null
  observaciones: string | null
  anulado: boolean
  tipo_movimiento: TipoMovimiento
  inventario: Inventario
  ubicacion_origen: Ubicacion | null
  ubicacion_destino: Ubicacion | null
}

export type EstadoSolicitud = 'ESPERA_APROBACION' | 'EN_CAMINO' | 'RECIBIDO'

export type SolicitudEquipoDetalle = {
  id: number
  nombre_equipo: string
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  codigo_patrimonial: string | null
  cantidad: number
  calibracion_salida: Inventario['calibracion']
  fecha_calibracion_salida: string | null
  calibracion_recepcion: Inventario['calibracion']
  fecha_calibracion_recepcion: string | null
  observaciones: string | null
  inventario: Inventario | null
  unidad_medida: Unidad
  condicion_salida: Catalogo | null
  condicion_recepcion: Catalogo | null
}

export type SolicitudEquipoHistorial = {
  id: number
  estado_anterior: EstadoSolicitud | null
  estado_nuevo: EstadoSolicitud
  usuario_id: number | null
  usuario_nombre: string
  comentario: string | null
  creado_en: string
}

export type SolicitudEquipo = {
  id: number
  codigo: string
  estado: EstadoSolicitud
  fecha_envio: string
  guia: string | null
  transportista: string | null
  solicitante_usuario_id: number | null
  solicitante_nombre: string
  aprobado_por_nombre: string | null
  fecha_aprobacion: string | null
  recibido_por_nombre: string | null
  fecha_recepcion: string | null
  observaciones_salida: string | null
  observaciones_recepcion: string | null
  creado_en: string
  ubicacion_origen: Ubicacion
  ubicacion_destino: Ubicacion
  detalles: SolicitudEquipoDetalle[]
  historial: SolicitudEquipoHistorial[]
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export type Dashboard = {
  articulos_activos: number
  categorias_activas: number
  ubicaciones_activas: number
  stock_bajo: number
  movimientos_recientes: Movimiento[]
  alertas_stock: Inventario[]
}

export type Catalogos = {
  categorias: Catalogo[]
  unidades: Unidad[]
  ubicaciones: Ubicacion[]
  condiciones: Catalogo[]
  almacenes: Almacen[]
  tipos: TipoMovimiento[]
}

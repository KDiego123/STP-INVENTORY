import type {
  Almacen,
  Catalogo,
  Dashboard,
  Inventario,
  Movimiento,
  Paginated,
  SolicitudEquipo,
  TipoMovimiento,
  Ubicacion,
  Unidad,
} from './types'

type RequestOptions = RequestInit & { params?: Record<string, string | number | boolean | null | undefined> }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin)
  Object.entries(options.params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    let message = 'No se pudo completar la operación.'
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') message = data.detail
      else if (Array.isArray(data.detail)) message = data.detail.map((item: { msg: string }) => item.msg).join(' ')
    } catch {
      // Mantiene el mensaje general.
    }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const inventoryApi = {
  list: (params: Record<string, string | number>) => api<Paginated<Inventario>>('/inventario', { params }),
  get: (id: number) => api<Inventario>(`/inventario/${id}`),
  nextCode: () => api<{ codigo: string }>('/inventario/siguiente-codigo'),
  create: (body: unknown) => api<Inventario>('/inventario', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) => api<Inventario>(`/inventario/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  toggle: (id: number) => api<Inventario>(`/inventario/${id}/estado`, { method: 'PATCH' }),
}

export const movementsApi = {
  list: (params: Record<string, string | number>) => api<Paginated<Movimiento>>('/movimientos', { params }),
  create: (body: unknown) => api<Movimiento>('/movimientos', { method: 'POST', body: JSON.stringify(body) }),
  cancel: (id: number) => api<Movimiento>(`/movimientos/${id}/anular`, { method: 'POST' }),
}

export const equipmentRequestsApi = {
  list: (params: Record<string, string | number>) => api<Paginated<SolicitudEquipo>>('/solicitudes-equipos', { params }),
  create: (body: unknown) => api<SolicitudEquipo>('/solicitudes-equipos', { method: 'POST', body: JSON.stringify(body) }),
  approve: (id: number, body: unknown) => api<SolicitudEquipo>(`/solicitudes-equipos/${id}/aprobar`, { method: 'POST', body: JSON.stringify(body) }),
  receive: (id: number, body: unknown) => api<SolicitudEquipo>(`/solicitudes-equipos/${id}/recibir`, { method: 'POST', body: JSON.stringify(body) }),
}

export const catalogsApi = {
  categories: (all = false) => api<Catalogo[]>('/catalogos/categorias', { params: { todos: all } }),
  units: (all = false) => api<Unidad[]>('/catalogos/unidades', { params: { todos: all } }),
  locations: (all = false) => api<Ubicacion[]>('/catalogos/ubicaciones', { params: { todos: all } }),
  conditions: (all = false) => api<Catalogo[]>('/catalogos/condiciones', { params: { todos: all } }),
  warehouses: () => api<Almacen[]>('/catalogos/almacenes'),
  movementTypes: () => api<TipoMovimiento[]>('/catalogos/tipos-movimiento'),
  save: (type: string, body: unknown, id?: number) =>
    api(`/${`catalogos/${type}`}${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    }),
  toggle: (type: string, id: number) => api(`/catalogos/${type}/${id}/estado`, { method: 'PATCH' }),
}

export const dashboardApi = () => api<Dashboard>('/dashboard')

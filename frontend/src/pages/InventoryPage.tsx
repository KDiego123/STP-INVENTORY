import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { catalogsApi, inventoryApi } from '../api'
import { EmptyState, ErrorNotice, formatNumber, Loader, Modal } from '../components'
import type { Catalogo, Inventario, Paginated, Ubicacion, Unidad } from '../types'

type Options = { categorias: Catalogo[]; unidades: Unidad[]; ubicaciones: Ubicacion[]; condiciones: Catalogo[] }
type FormData = {
  codigo: string; descripcion: string; categoria_id: string; unidad_medida_id: string
  ubicacion_id: string; condicion_id: string; stock_actual: string; stock_minimo: string
  costo_unitario: string; fecha_ultima_entrada: string; fecha_ultima_salida: string
  observaciones: string; activo: boolean
}

const emptyForm: FormData = {
  codigo: '', descripcion: '', categoria_id: '', unidad_medida_id: '', ubicacion_id: '', condicion_id: '',
  stock_actual: '0', stock_minimo: '', costo_unitario: '', fecha_ultima_entrada: '', fecha_ultima_salida: '',
  observaciones: '', activo: true,
}

export function InventoryPage({ notify }: { notify: (message: string, type?: 'success' | 'error') => void }) {
  const [data, setData] = useState<Paginated<Inventario> | null>(null)
  const [options, setOptions] = useState<Options>({ categorias: [], unidades: [], ubicaciones: [], condiciones: [] })
  const [filters, setFilters] = useState({ q: '', categoria_id: '', ubicacion_id: '', estado: 'activos', orden: 'desc' })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Inventario | 'new' | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [result, categorias, unidades, ubicaciones, condiciones] = await Promise.all([
        inventoryApi.list({ ...applied, page, page_size: 20 }), catalogsApi.categories(), catalogsApi.units(), catalogsApi.locations(), catalogsApi.conditions(),
      ])
      setData(result); setOptions({ categorias, unidades, ubicaciones, condiciones })
    } catch (err) { setError(err instanceof Error ? err.message : 'Error inesperado') }
    finally { setLoading(false) }
  }, [applied, page])
  useEffect(() => { void load() }, [load])

  const search = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied(filters) }
  const clear = () => { const next = { q: '', categoria_id: '', ubicacion_id: '', estado: 'activos', orden: 'desc' }; setFilters(next); setApplied(next); setPage(1) }
  const toggleOrder = () => {
    const orden = filters.orden === 'desc' ? 'asc' : 'desc'
    const next = { ...filters, orden }
    setFilters(next)
    setApplied(next)
    setPage(1)
  }
  const toggle = async (item: Inventario) => {
    if (!window.confirm(`¿Deseas ${item.activo ? 'desactivar' : 'activar'} ${item.codigo}?`)) return
    try { await inventoryApi.toggle(item.id); notify(`Artículo ${item.activo ? 'desactivado' : 'activado'} correctamente.`); await load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No se pudo cambiar el estado.', 'error') }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">Almacén Lima</p><h1>Inventario</h1><p>Consulta y administra los artículos registrados.</p></div><button className="btn btn-primary" onClick={() => setEditing('new')}>＋ Nuevo artículo</button></div>
    <form className="filter-bar" onSubmit={search}>
      <label className="search-field"><span>⌕</span><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Buscar código, descripción u observación" /></label>
      <select value={filters.categoria_id} onChange={(e) => setFilters({ ...filters, categoria_id: e.target.value })}><option value="">Todas las categorías</option>{options.categorias.map((item) => <option value={item.id} key={item.id}>{item.nombre}</option>)}</select>
      <select value={filters.ubicacion_id} onChange={(e) => setFilters({ ...filters, ubicacion_id: e.target.value })}><option value="">Todas las ubicaciones</option>{options.ubicaciones.map((item) => <option value={item.id} key={item.id}>{item.codigo}</option>)}</select>
      <select value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}><option value="activos">Activos</option><option value="bajo">Stock bajo</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option></select>
      <button type="button" className="btn btn-secondary sort-button" onClick={toggleOrder} title="Alternar el orden por ID">
        {filters.orden === 'desc' ? '↓ ID · nuevos primero' : '↑ ID · antiguos primero'}
      </button>
      <button className="btn btn-secondary">Filtrar</button><button type="button" className="btn btn-ghost" onClick={clear}>Limpiar</button>
    </form>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading && !data ? <Loader /> : <section className="card table-card">
      <div className="table-summary"><strong>{data?.total ?? 0}</strong> registros encontrados</div>
      <div className="table-responsive"><table><thead><tr><th>Código y descripción</th><th>Categoría</th><th>Ubicación</th><th className="numeric">Stock</th><th>Condición</th><th>Estado</th><th /></tr></thead>
        <tbody>{data?.items.map((item) => {
          const low = item.stock_minimo !== null && Number(item.stock_actual) <= Number(item.stock_minimo)
          return <tr key={item.id} className={!item.activo ? 'row-muted' : ''}>
            <td><button className="item-title" onClick={() => setEditing(item)}>{item.codigo}</button><small className="item-subtitle">{item.descripcion}</small></td>
            <td><span className="tag">{item.categoria.nombre}</span></td><td><span className="location-code">{item.ubicacion.codigo}</span></td>
            <td className={`numeric ${low ? 'text-danger' : ''}`}><strong>{formatNumber(item.stock_actual)}</strong><small>{item.unidad_medida.codigo}</small></td>
            <td>{item.condicion?.nombre ?? '—'}</td><td><span className={`badge ${item.activo ? 'badge-success' : 'badge-neutral'}`}>{item.activo ? 'Activo' : 'Inactivo'}</span>{low && <span className="badge badge-danger">Stock bajo</span>}</td>
            <td className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => setEditing(item)}>Editar</button><button className="btn btn-ghost btn-sm" onClick={() => void toggle(item)}>{item.activo ? 'Desactivar' : 'Activar'}</button></td>
          </tr>})}</tbody></table></div>
      {!data?.items.length && <EmptyState title="No encontramos artículos" text="Cambia los filtros o registra un artículo nuevo." />}
      {data && data.pages > 1 && <div className="pagination"><span>Página {data.page} de {data.pages}</span><div><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button><button className="btn btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente →</button></div></div>}
    </section>}
    {editing && <InventoryForm item={editing === 'new' ? null : editing} options={options} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); notify(message); await load() }} />}
  </>
}

function InventoryForm({ item, options, onClose, onSaved }: { item: Inventario | null; options: Options; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [form, setForm] = useState<FormData>(() => item ? {
    codigo: item.codigo, descripcion: item.descripcion, categoria_id: String(item.categoria_id), unidad_medida_id: String(item.unidad_medida_id),
    ubicacion_id: String(item.ubicacion_id), condicion_id: item.condicion_id ? String(item.condicion_id) : '', stock_actual: item.stock_actual,
    stock_minimo: item.stock_minimo ?? '', costo_unitario: item.costo_unitario ?? '', fecha_ultima_entrada: item.fecha_ultima_entrada ?? '',
    fecha_ultima_salida: item.fecha_ultima_salida ?? '', observaciones: item.observaciones ?? '', activo: item.activo,
  } : emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!item) inventoryApi.nextCode().then(({ codigo }) => setForm((current) => ({ ...current, codigo }))).catch(() => undefined) }, [item])
  const update = (key: keyof FormData, value: string | boolean) => setForm({ ...form, [key]: value })
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const payload = {
      ...form, categoria_id: Number(form.categoria_id), unidad_medida_id: Number(form.unidad_medida_id), ubicacion_id: Number(form.ubicacion_id),
      condicion_id: form.condicion_id ? Number(form.condicion_id) : null, stock_actual: form.stock_actual || '0', stock_minimo: form.stock_minimo || null,
      costo_unitario: form.costo_unitario || null, fecha_ultima_entrada: form.fecha_ultima_entrada || null, fecha_ultima_salida: form.fecha_ultima_salida || null,
      observaciones: form.observaciones.trim() || null,
    }
    try { item ? await inventoryApi.update(item.id, payload) : await inventoryApi.create(payload); await onSaved(`Artículo ${form.codigo} ${item ? 'actualizado' : 'creado'} correctamente.`) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.') }
    finally { setSaving(false) }
  }
  return <Modal wide title={item ? `Editar ${item.codigo}` : 'Nuevo artículo'} subtitle="Completa la información principal del inventario." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    <form className="form-grid" onSubmit={submit}>
      <Field label="Código" required><input value={form.codigo} onChange={(e) => update('codigo', e.target.value)} required /></Field>
      <Field label="Descripción" required className="span-2"><input value={form.descripcion} onChange={(e) => update('descripcion', e.target.value)} required /></Field>
      <Field label="Categoría" required><select value={form.categoria_id} onChange={(e) => update('categoria_id', e.target.value)} required><option value="">Seleccionar</option>{options.categorias.map((x) => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select></Field>
      <Field label="Unidad de medida" required><select value={form.unidad_medida_id} onChange={(e) => update('unidad_medida_id', e.target.value)} required><option value="">Seleccionar</option>{options.unidades.map((x) => <option value={x.id} key={x.id}>{x.nombre} ({x.codigo})</option>)}</select></Field>
      <Field label="Ubicación" required><select value={form.ubicacion_id} onChange={(e) => update('ubicacion_id', e.target.value)} required><option value="">Seleccionar</option>{options.ubicaciones.map((x) => <option value={x.id} key={x.id}>{x.codigo}</option>)}</select></Field>
      <Field label="Condición"><select value={form.condicion_id} onChange={(e) => update('condicion_id', e.target.value)}><option value="">Sin condición</option>{options.condiciones.map((x) => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select></Field>
      <Field label="Stock actual" required><input type="number" min="0" step="0.001" value={form.stock_actual} onChange={(e) => update('stock_actual', e.target.value)} required /></Field>
      <Field label="Stock mínimo"><input type="number" min="0" step="0.001" value={form.stock_minimo} onChange={(e) => update('stock_minimo', e.target.value)} /></Field>
      <Field label="Costo unitario (S/)"><input type="number" min="0" step="0.01" value={form.costo_unitario} onChange={(e) => update('costo_unitario', e.target.value)} /></Field>
      <Field label="Última entrada"><input type="date" value={form.fecha_ultima_entrada} onChange={(e) => update('fecha_ultima_entrada', e.target.value)} /></Field>
      <Field label="Última salida"><input type="date" value={form.fecha_ultima_salida} onChange={(e) => update('fecha_ultima_salida', e.target.value)} /></Field>
      <Field label="Observaciones" className="span-3"><textarea rows={3} value={form.observaciones} onChange={(e) => update('observaciones', e.target.value)} /></Field>
      <label className="check-field span-3"><input type="checkbox" checked={form.activo} onChange={(e) => update('activo', e.target.checked)} /><span>Artículo activo</span></label>
      <div className="form-actions span-3"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar artículo'}</button></div>
    </form>
  </Modal>
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`field ${className}`}><span>{label}{required && <b>*</b>}</span>{children}</label>
}

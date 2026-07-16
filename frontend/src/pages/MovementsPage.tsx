import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { catalogsApi, inventoryApi, movementsApi } from '../api'
import { EmptyState, ErrorNotice, formatDate, formatNumber, Loader, Modal } from '../components'
import type { Inventario, Movimiento, Paginated, TipoMovimiento, Ubicacion } from '../types'

type Options = { tipos: TipoMovimiento[]; inventario: Inventario[]; ubicaciones: Ubicacion[] }

function localDateTime() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function MovementsPage({ notify }: { notify: (message: string, type?: 'success' | 'error') => void }) {
  const [data, setData] = useState<Paginated<Movimiento> | null>(null)
  const [options, setOptions] = useState<Options>({ tipos: [], inventario: [], ubicaciones: [] })
  const [filters, setFilters] = useState({ q: '', tipo_id: '', estado: 'vigentes', orden: 'desc' })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [result, tipos, inventoryResult, ubicaciones] = await Promise.all([
        movementsApi.list({ ...applied, page, page_size: 20 }), catalogsApi.movementTypes(), inventoryApi.list({ estado: 'activos', page: 1, page_size: 500 }), catalogsApi.locations(),
      ])
      setData(result); setOptions({ tipos, inventario: inventoryResult.items, ubicaciones })
    } catch (err) { setError(err instanceof Error ? err.message : 'Error inesperado') }
    finally { setLoading(false) }
  }, [applied, page])
  useEffect(() => { void load() }, [load])
  const search = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied(filters) }
  const toggleOrder = () => {
    const orden = filters.orden === 'desc' ? 'asc' : 'desc'
    const next = { ...filters, orden }
    setFilters(next)
    setApplied(next)
    setPage(1)
  }
  const cancel = async (item: Movimiento) => {
    if (!window.confirm(`¿Anular el movimiento #${item.id}? El stock será revertido.`)) return
    try { await movementsApi.cancel(item.id); notify('Movimiento anulado y stock revertido.'); await load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No se pudo anular.', 'error') }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">Control de operaciones</p><h1>Movimientos</h1><p>Registra entradas, salidas, ajustes y traslados.</p></div><button className="btn btn-primary" onClick={() => setCreating(true)}>＋ Registrar movimiento</button></div>
    <form className="filter-bar" onSubmit={search}>
      <label className="search-field"><span>⌕</span><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Artículo, responsable o documento" /></label>
      <select value={filters.tipo_id} onChange={(e) => setFilters({ ...filters, tipo_id: e.target.value })}><option value="">Todos los tipos</option>{options.tipos.map((x) => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select>
      <select value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}><option value="vigentes">Vigentes</option><option value="anulados">Anulados</option><option value="todos">Todos</option></select>
      <button type="button" className="btn btn-secondary sort-button" onClick={toggleOrder} title="Cambiar el orden por fecha">
        {filters.orden === 'desc' ? '↓ Más recientes primero' : '↑ Más antiguos primero'}
      </button>
      <button className="btn btn-secondary">Filtrar</button>
    </form>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading && !data ? <Loader /> : <section className="card table-card">
      <div className="table-summary"><strong>{data?.total ?? 0}</strong> movimientos encontrados</div>
      <div className="table-responsive"><table><thead><tr><th>Fecha</th><th>Tipo y artículo</th><th className="numeric">Cantidad</th><th>Stock</th><th>Responsable</th><th>Documento</th><th>Estado</th><th /></tr></thead>
        <tbody>{data?.items.map((item) => <tr key={item.id} className={item.anulado ? 'row-muted' : ''}>
          <td>{formatDate(item.fecha, true)}</td><td><strong>{item.tipo_movimiento.nombre}</strong><small className="item-subtitle">{item.inventario.codigo} · {item.inventario.descripcion}</small></td>
          <td className="numeric"><strong>{formatNumber(item.cantidad)}</strong><small>{item.inventario.unidad_medida.codigo}</small></td>
          <td>{formatNumber(item.stock_anterior)} → {formatNumber(item.stock_posterior)}</td><td>{item.responsable || '—'}</td><td>{item.documento || '—'}</td>
          <td><span className={`badge ${item.anulado ? 'badge-neutral' : 'badge-success'}`}>{item.anulado ? 'Anulado' : 'Vigente'}</span></td>
          <td>{!item.anulado && <button className="btn btn-ghost btn-sm text-danger" onClick={() => void cancel(item)}>Anular</button>}</td>
        </tr>)}</tbody></table></div>
      {!data?.items.length && <EmptyState icon="⇄" title="No hay movimientos" text="Registra la primera entrada, salida, ajuste o traslado." />}
      {data && data.pages > 1 && <div className="pagination"><span>Página {data.page} de {data.pages}</span><div><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button><button className="btn btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente →</button></div></div>}
    </section>}
    {creating && <MovementForm options={options} onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); notify('Movimiento registrado y stock actualizado.'); await load() }} />}
  </>
}

function MovementForm({ options, onClose, onSaved }: { options: Options; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ fecha: localDateTime(), tipo_movimiento_id: '', inventario_id: '', cantidad: '', ubicacion_origen_id: '', ubicacion_destino_id: '', responsable: '', motivo: '', documento: '', observaciones: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedItem = useMemo(() => options.inventario.find((x) => x.id === Number(form.inventario_id)), [form.inventario_id, options.inventario])
  const selectedType = useMemo(() => options.tipos.find((x) => x.id === Number(form.tipo_movimiento_id)), [form.tipo_movimiento_id, options.tipos])
  const update = (key: keyof typeof form, value: string) => {
    const next = { ...form, [key]: value }
    if (key === 'inventario_id') {
      const item = options.inventario.find((x) => x.id === Number(value))
      if (item) { next.ubicacion_origen_id = String(item.ubicacion_id); next.ubicacion_destino_id = String(item.ubicacion_id) }
    }
    setForm(next)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const payload = {
      fecha: new Date(form.fecha).toISOString(), tipo_movimiento_id: Number(form.tipo_movimiento_id), inventario_id: Number(form.inventario_id), cantidad: form.cantidad,
      ubicacion_origen_id: form.ubicacion_origen_id ? Number(form.ubicacion_origen_id) : null, ubicacion_destino_id: form.ubicacion_destino_id ? Number(form.ubicacion_destino_id) : null,
      responsable: form.responsable.trim() || null, motivo: form.motivo.trim() || null, documento: form.documento.trim() || null, observaciones: form.observaciones.trim() || null,
    }
    if (selectedType?.codigo === 'ENTRADA') payload.ubicacion_origen_id = null
    if (selectedType?.codigo === 'SALIDA') payload.ubicacion_destino_id = null
    if (selectedType?.codigo.startsWith('AJUSTE')) { payload.ubicacion_origen_id = null; payload.ubicacion_destino_id = null }
    try { await movementsApi.create(payload); await onSaved() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.') }
    finally { setSaving(false) }
  }
  return <Modal wide title="Registrar movimiento" subtitle="El stock se actualizará automáticamente al guardar." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    <form className="form-grid" onSubmit={submit}>
      <Field label="Fecha y hora" required><input type="datetime-local" value={form.fecha} onChange={(e) => update('fecha', e.target.value)} required /></Field>
      <Field label="Tipo de movimiento" required><select value={form.tipo_movimiento_id} onChange={(e) => update('tipo_movimiento_id', e.target.value)} required><option value="">Seleccionar</option>{options.tipos.map((x) => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select></Field>
      <Field label="Artículo" required className="span-2"><select value={form.inventario_id} onChange={(e) => update('inventario_id', e.target.value)} required><option value="">Seleccionar artículo</option>{options.inventario.map((x) => <option value={x.id} key={x.id}>{x.codigo} · {x.descripcion} ({formatNumber(x.stock_actual)} {x.unidad_medida.codigo})</option>)}</select></Field>
      <Field label={`Cantidad${selectedItem ? ` (${selectedItem.unidad_medida.codigo})` : ''}`} required><input type="number" min="0.001" step="0.001" value={form.cantidad} onChange={(e) => update('cantidad', e.target.value)} required /></Field>
      <Field label="Responsable"><input value={form.responsable} onChange={(e) => update('responsable', e.target.value)} placeholder="Nombre de quien solicita o entrega" /></Field>
      {(selectedType?.requiere_origen || selectedType?.codigo === 'SALIDA') && <Field label="Ubicación de origen" required><select value={form.ubicacion_origen_id} onChange={(e) => update('ubicacion_origen_id', e.target.value)} required><option value="">Seleccionar</option>{options.ubicaciones.map((x) => <option value={x.id} key={x.id}>{x.codigo}</option>)}</select></Field>}
      {(selectedType?.requiere_destino || selectedType?.codigo === 'ENTRADA') && <Field label="Ubicación de destino" required><select value={form.ubicacion_destino_id} onChange={(e) => update('ubicacion_destino_id', e.target.value)} required><option value="">Seleccionar</option>{options.ubicaciones.map((x) => <option value={x.id} key={x.id}>{x.codigo}</option>)}</select></Field>}
      <Field label="Documento"><input value={form.documento} onChange={(e) => update('documento', e.target.value)} placeholder="Factura, guía u orden" /></Field>
      <Field label="Motivo" className="span-2"><textarea rows={2} value={form.motivo} onChange={(e) => update('motivo', e.target.value)} /></Field>
      <Field label="Observaciones" className="span-2"><textarea rows={2} value={form.observaciones} onChange={(e) => update('observaciones', e.target.value)} /></Field>
      <div className="form-actions span-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Registrando…' : 'Registrar movimiento'}</button></div>
    </form>
  </Modal>
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`field ${className}`}><span>{label}{required && <b>*</b>}</span>{children}</label>
}

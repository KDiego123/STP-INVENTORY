import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { catalogsApi, inventoryApi } from '../api'
import { EmptyState, ErrorNotice, formatDate, formatNumber, Loader, Modal } from '../components'
import type { Catalogo, Inventario, Paginated, Ubicacion, Unidad } from '../types'

type Options = { categorias: Catalogo[]; unidades: Unidad[]; ubicaciones: Ubicacion[]; condiciones: Catalogo[] }
type FormData = {
  codigo: string; descripcion: string; categoria_id: string; unidad_medida_id: string
  ubicacion_id: string; condicion_id: string; stock_actual: string; stock_minimo: string
  costo_unitario: string; fecha_ultima_entrada: string; fecha_ultima_salida: string
  calibracion: string; fecha_calibracion: string; marca: string; modelo: string
  numero_serie: string; codigo_patrimonial: string; observaciones: string; activo: boolean
}

const emptyForm: FormData = {
  codigo: '', descripcion: '', categoria_id: '', unidad_medida_id: '', ubicacion_id: '', condicion_id: '',
  stock_actual: '0', stock_minimo: '', costo_unitario: '', fecha_ultima_entrada: '', fecha_ultima_salida: '',
  calibracion: '', fecha_calibracion: '', marca: '', modelo: '', numero_serie: '',
  codigo_patrimonial: '', observaciones: '', activo: true,
}

const calibrationLabels = { NO_CUMPLE: 'No cumple', SIN_CALIBRAR: 'Sin calibrar', CALIBRADO: 'Calibrado' } as const

export function InventoryPage({ notify, readOnly = false }: { notify: (message: string, type?: 'success' | 'error') => void; readOnly?: boolean }) {
  const [data, setData] = useState<Paginated<Inventario> | null>(null)
  const [options, setOptions] = useState<Options>({ categorias: [], unidades: [], ubicaciones: [], condiciones: [] })
  const [filters, setFilters] = useState({ q: '', categoria_id: '', ubicacion_id: '', estado: 'activos', orden: 'desc' })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Inventario | null>(null)
  const [editing, setEditing] = useState<Inventario | 'new' | null>(null)
  const [statusPending, setStatusPending] = useState<Inventario | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
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
  const toggle = async () => {
    if (!statusPending) return
    setChangingStatus(true)
    try {
      await inventoryApi.toggle(statusPending.id)
      notify(`Artículo ${statusPending.activo ? 'desactivado' : 'activado'} correctamente.`)
      setStatusPending(null)
      await load()
    }
    catch (err) { notify(err instanceof Error ? err.message : 'No se pudo cambiar el estado.', 'error') }
    finally { setChangingStatus(false) }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">Almacén Lima</p><h1>Inventario</h1><p>{readOnly ? 'Consulta los artículos registrados en modo de solo lectura.' : 'Consulta y administra los artículos registrados.'}</p></div>{!readOnly && <button className="btn btn-primary" onClick={() => setEditing('new')}>＋ Nuevo artículo</button>}</div>
    <form className="filter-bar filter-bar-inventory" onSubmit={search}>
      <label className="search-field"><span>⌕</span><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Buscar código, descripción u observación" /></label>
      <select value={filters.categoria_id} onChange={(e) => setFilters({ ...filters, categoria_id: e.target.value })}><option value="">Todas las categorías</option>{options.categorias.map((item) => <option value={item.id} key={item.id}>{item.nombre}</option>)}</select>
      <select value={filters.ubicacion_id} onChange={(e) => setFilters({ ...filters, ubicacion_id: e.target.value })}><option value="">Todas las ubicaciones</option>{options.ubicaciones.map((item) => <option value={item.id} key={item.id}>{item.codigo}</option>)}</select>
      <select value={filters.estado} onChange={(e) => setFilters({ ...filters, estado: e.target.value })}><option value="activos">Activos</option><option value="bajo">Stock bajo</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option></select>
      <div className="filter-actions"><button className="btn btn-primary">Filtrar</button><button type="button" className="btn btn-secondary" onClick={clear}>Limpiar</button></div>
    </form>
    <div className="sort-bar" aria-label="Orden del inventario">
      <span>Ordenar por</span>
      <button type="button" className="btn btn-secondary sort-button" onClick={toggleOrder} title="Alternar el orden por ID">
        {filters.orden === 'desc' ? '↓ ID · nuevos primero' : '↑ ID · antiguos primero'}
      </button>
    </div>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading && !data ? <Loader /> : <section className="card table-card">
      <div className="table-summary"><strong>{data?.total ?? 0}</strong> registros encontrados</div>
      <div className="table-responsive"><table><thead><tr><th>Descripción y código</th><th>Categoría</th><th>Ubicación</th><th className="numeric">Stock</th><th>Condición</th><th>Calibración</th><th>Estado</th>{!readOnly && <th />}</tr></thead>
        <tbody>{data?.items.map((item) => {
          const low = item.stock_minimo !== null && Number(item.stock_actual) <= Number(item.stock_minimo)
          return <tr
            key={item.id}
            className={`clickable-row ${!item.activo ? 'row-muted' : ''}`}
            onClick={() => setSelected(item)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelected(item)
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Ver detalle de ${item.descripcion}`}
          >
            <td><strong className="item-title-static">{item.descripcion}</strong><small className="item-subtitle">{item.codigo}{item.numero_serie ? ` · Serie ${item.numero_serie}` : ''}{item.codigo_patrimonial ? ` · Patr. ${item.codigo_patrimonial}` : ''}</small></td>
            <td><span className="tag">{item.categoria.nombre}</span></td><td><span className="location-code">{item.ubicacion.codigo}</span></td>
            <td className={`numeric ${low ? 'text-danger' : ''}`}><strong>{formatNumber(item.stock_actual)}</strong><small>{item.unidad_medida.codigo}</small></td>
            <td>{item.condicion?.nombre ?? '—'}</td><td>{item.calibracion ? <><span className={`badge calibration-${item.calibracion.toLowerCase()}`}>{calibrationLabels[item.calibracion]}</span>{item.fecha_calibracion && <small className="calibration-date">{formatDate(item.fecha_calibracion)}</small>}</> : '—'}</td><td><span className={`badge ${item.activo ? 'badge-success' : 'badge-neutral'}`}>{item.activo ? 'Activo' : 'Inactivo'}</span>{low && <span className="badge badge-danger">Stock bajo</span>}</td>
            {!readOnly && <td className="row-actions"><div className="inventory-row-actions"><button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); setEditing(item) }}>Editar</button><button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); setStatusPending(item) }}>{item.activo ? 'Desactivar' : 'Activar'}</button></div></td>}
          </tr>})}</tbody></table></div>
      {!data?.items.length && <EmptyState title="No encontramos artículos" text="Cambia los filtros o registra un artículo nuevo." />}
      {data && data.pages > 1 && <div className="pagination"><span>Página {data.page} de {data.pages}</span><div><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button><button className="btn btn-secondary btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente →</button></div></div>}
    </section>}
    {selected && <InventoryDetail
      item={selected}
      readOnly={readOnly}
      onClose={() => setSelected(null)}
      onEdit={() => { setSelected(null); setEditing(selected) }}
    />}
    {statusPending && <InventoryStatusConfirmation
      item={statusPending}
      saving={changingStatus}
      onClose={() => !changingStatus && setStatusPending(null)}
      onConfirm={() => void toggle()}
    />}
    {editing && <InventoryForm item={editing === 'new' ? null : editing} options={options} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); notify(message); await load() }} />}
  </>
}

function InventoryStatusConfirmation({ item, saving, onClose, onConfirm }: {
  item: Inventario
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const deactivating = item.activo
  return <Modal
    title={`${deactivating ? 'Desactivar' : 'Activar'} ${item.codigo}`}
    subtitle={item.descripcion}
    onClose={onClose}
    compact
  >
    {deactivating ? <div className="inventory-status-notice">
      <span aria-hidden="true">i</span>
      <p><strong>No se eliminará.</strong> Sus datos y movimientos se conservarán; podrás reactivarlo desde “Inactivos” o “Todos”.</p>
    </div> : <div className="inventory-status-notice activate">
      <span aria-hidden="true">i</span>
      <p>Volverá al inventario activo sin perder datos ni movimientos anteriores.</p>
    </div>}
    <div className="form-actions">
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="button" className={`btn ${deactivating ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={saving}>
        {saving ? 'Procesando…' : deactivating ? 'Sí, desactivar' : 'Sí, activar'}
      </button>
    </div>
  </Modal>
}

function InventoryDetail({ item, readOnly, onClose, onEdit }: {
  item: Inventario
  readOnly: boolean
  onClose: () => void
  onEdit: () => void
}) {
  const low = item.stock_minimo !== null && Number(item.stock_actual) <= Number(item.stock_minimo)
  const isEquipment = item.categoria.nombre.trim().toUpperCase() === 'EQUIPO'
  const identity = isEquipment ? [item.marca, item.modelo].filter(Boolean).join(' · ') : ''
  return <Modal wide title={item.descripcion} subtitle={item.codigo} onClose={onClose}>
    <div className="inventory-detail">
      <div className="inventory-detail-hero">
        <div>
          <div className="inventory-detail-badges">
            <span className={`badge ${item.activo ? 'badge-success' : 'badge-neutral'}`}>{item.activo ? 'Activo' : 'Inactivo'}</span>
            {low && <span className="badge badge-danger">Stock bajo</span>}
            <span className="tag">{item.categoria.nombre}</span>
          </div>
          <p>{identity || 'Artículo de inventario'}{isEquipment && item.numero_serie ? ` · Serie ${item.numero_serie}` : ''}</p>
        </div>
        <div className={`inventory-detail-stock ${low ? 'low' : ''}`}>
          <small>Stock actual</small>
          <strong>{formatNumber(item.stock_actual)}</strong>
          <span>{item.unidad_medida.nombre} ({item.unidad_medida.codigo})</span>
        </div>
      </div>

      <section className="inventory-detail-section">
        <h3>Información general</h3>
        <div className="inventory-detail-grid">
          <DetailValue label="Código" value={item.codigo} />
          <DetailValue label="Categoría" value={item.categoria.nombre} />
          <DetailValue label="Ubicación" value={`${item.ubicacion.codigo} · ${item.ubicacion.almacen.nombre}`} />
          <DetailValue label="Condición" value={item.condicion?.nombre} />
          <DetailValue label="Stock mínimo" value={item.stock_minimo === null ? null : `${formatNumber(item.stock_minimo)} ${item.unidad_medida.codigo}`} />
          <DetailValue label="Costo unitario" value={item.costo_unitario === null ? null : `S/ ${formatNumber(item.costo_unitario)}`} />
        </div>
      </section>

      {isEquipment && <section className="inventory-detail-section">
        <h3>Identificación y calibración</h3>
        <div className="inventory-detail-grid">
          <DetailValue label="Marca" value={item.marca} />
          <DetailValue label="Modelo" value={item.modelo} />
          <DetailValue label="Número de serie" value={item.numero_serie} />
          <DetailValue label="Código patrimonial" value={item.codigo_patrimonial} />
          <DetailValue label="Calibración" value={item.calibracion ? calibrationLabels[item.calibracion] : null} />
          <DetailValue label="Fecha de calibración" value={item.fecha_calibracion ? formatDate(item.fecha_calibracion) : null} />
        </div>
      </section>}

      <section className="inventory-detail-section">
        <h3>Actividad</h3>
        <div className="inventory-detail-grid">
          <DetailValue label="Última entrada" value={item.fecha_ultima_entrada ? formatDate(item.fecha_ultima_entrada) : null} />
          <DetailValue label="Última salida" value={item.fecha_ultima_salida ? formatDate(item.fecha_ultima_salida) : null} />
          <DetailValue label="Observaciones" value={item.observaciones} wide />
        </div>
      </section>

      <div className="request-detail-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        {!readOnly && <button type="button" className="btn btn-primary" onClick={onEdit}>Editar artículo</button>}
      </div>
    </div>
  </Modal>
}

function DetailValue({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return <div className={`inventory-detail-value ${wide ? 'wide' : ''}`}><small>{label}</small><strong>{value || '—'}</strong></div>
}

function InventoryForm({ item, options, onClose, onSaved }: { item: Inventario | null; options: Options; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [form, setForm] = useState<FormData>(() => item ? {
    codigo: item.codigo, descripcion: item.descripcion, categoria_id: String(item.categoria_id), unidad_medida_id: String(item.unidad_medida_id),
    ubicacion_id: String(item.ubicacion_id), condicion_id: item.condicion_id ? String(item.condicion_id) : '', stock_actual: item.stock_actual,
    stock_minimo: item.stock_minimo ?? '', costo_unitario: item.costo_unitario ?? '', fecha_ultima_entrada: item.fecha_ultima_entrada ?? '',
    fecha_ultima_salida: item.fecha_ultima_salida ?? '', calibracion: item.calibracion ?? '', fecha_calibracion: item.fecha_calibracion ?? '',
    marca: item.marca ?? '', modelo: item.modelo ?? '', numero_serie: item.numero_serie ?? '',
    codigo_patrimonial: item.codigo_patrimonial ?? '', observaciones: item.observaciones ?? '', activo: item.activo,
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
      calibracion: form.calibracion || null, fecha_calibracion: form.fecha_calibracion || null,
      marca: form.marca.trim() || null, modelo: form.modelo.trim() || null,
      numero_serie: form.numero_serie.trim() || null, codigo_patrimonial: form.codigo_patrimonial.trim() || null,
      observaciones: form.observaciones.trim() || null,
    }
    try { item ? await inventoryApi.update(item.id, payload) : await inventoryApi.create(payload); await onSaved(`Artículo ${form.codigo} ${item ? 'actualizado' : 'creado'} correctamente.`) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.') }
    finally { setSaving(false) }
  }
  const selectedCategory = options.categorias.find((x) => x.id === Number(form.categoria_id))
  const isEquipment = selectedCategory?.nombre.trim().toUpperCase() === 'EQUIPO'
  return <Modal wide title={item ? `Editar ${item.codigo}` : 'Nuevo artículo'} subtitle="Completa la información principal del inventario." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    <form className="form-grid" onSubmit={submit}>
      <Field label="Código" required><input value={form.codigo} onChange={(e) => update('codigo', e.target.value)} required /></Field>
      <Field label="Descripción" required className="span-2"><input value={form.descripcion} onChange={(e) => update('descripcion', e.target.value)} required /></Field>
      <Field label="Categoría" required><select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value, calibracion: '', fecha_calibracion: '', marca: '', modelo: '', numero_serie: '', codigo_patrimonial: '' })} required><option value="">Seleccionar</option>{options.categorias.map((x) => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select></Field>
      <Field label="Unidad de medida" required><select value={form.unidad_medida_id} onChange={(e) => update('unidad_medida_id', e.target.value)} required><option value="">Seleccionar</option>{options.unidades.map((x) => <option value={x.id} key={x.id}>{x.nombre} ({x.codigo})</option>)}</select></Field>
      <Field label="Ubicación" required><select value={form.ubicacion_id} onChange={(e) => update('ubicacion_id', e.target.value)} required><option value="">Seleccionar</option>{options.ubicaciones.map((x) => <option value={x.id} key={x.id}>{x.codigo}</option>)}</select></Field>
      <Field label="Condición"><select value={form.condicion_id} onChange={(e) => update('condicion_id', e.target.value)}><option value="">Sin condición</option>{options.condiciones.map((x) => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select></Field>
      <Field label="Stock actual" required><input type="number" min="0" step="0.001" value={form.stock_actual} onChange={(e) => update('stock_actual', e.target.value)} required /></Field>
      <Field label="Stock mínimo"><input type="number" min="0" step="0.001" value={form.stock_minimo} onChange={(e) => update('stock_minimo', e.target.value)} /></Field>
      <Field label="Costo unitario (S/)"><input type="number" min="0" step="0.01" value={form.costo_unitario} onChange={(e) => update('costo_unitario', e.target.value)} /></Field>
      <Field label="Última entrada"><input type="date" value={form.fecha_ultima_entrada} onChange={(e) => update('fecha_ultima_entrada', e.target.value)} /></Field>
      <Field label="Última salida"><input type="date" value={form.fecha_ultima_salida} onChange={(e) => update('fecha_ultima_salida', e.target.value)} /></Field>
      <section className="calibration-panel span-3">
        <div className="calibration-panel-heading"><div><strong>Calibración del equipo</strong><small>Estado y fecha de la última calibración registrada.</small></div><span className={`badge ${isEquipment ? 'badge-success' : 'badge-neutral'}`}>{isEquipment ? 'Aplica' : 'No aplica'}</span></div>
        {isEquipment ? <>
          <div className="calibration-fields"><Field label="Estado de calibración" required><select value={form.calibracion} onChange={(e) => setForm({ ...form, calibracion: e.target.value, fecha_calibracion: e.target.value === 'CALIBRADO' ? form.fecha_calibracion : '' })} required><option value="">Seleccionar</option><option value="NO_CUMPLE">No cumple</option><option value="SIN_CALIBRAR">Sin calibrar</option><option value="CALIBRADO">Calibrado</option></select></Field><Field label="Fecha de calibración" required={form.calibracion === 'CALIBRADO'}><input type="date" value={form.fecha_calibracion} onChange={(e) => update('fecha_calibracion', e.target.value)} required={form.calibracion === 'CALIBRADO'} disabled={form.calibracion !== 'CALIBRADO'} /></Field></div>
          <div className="equipment-identity-grid"><Field label="Marca"><input value={form.marca} onChange={(e) => update('marca', e.target.value)} /></Field><Field label="Modelo"><input value={form.modelo} onChange={(e) => update('modelo', e.target.value)} /></Field><Field label="Número de serie"><input value={form.numero_serie} onChange={(e) => update('numero_serie', e.target.value)} /></Field><Field label="Código patrimonial"><input value={form.codigo_patrimonial} onChange={(e) => update('codigo_patrimonial', e.target.value)} /></Field></div>
        </> : <p>Disponible únicamente cuando la categoría del artículo es EQUIPO.</p>}
      </section>
      <Field label="Observaciones" className="span-3"><textarea rows={3} value={form.observaciones} onChange={(e) => update('observaciones', e.target.value)} /></Field>
      <label className="check-field span-3"><input type="checkbox" checked={form.activo} onChange={(e) => update('activo', e.target.checked)} /><span>Artículo activo</span></label>
      <div className="form-actions span-3"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar artículo'}</button></div>
    </form>
  </Modal>
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`field ${className}`}><span>{label}{required && <b>*</b>}</span>{children}</label>
}

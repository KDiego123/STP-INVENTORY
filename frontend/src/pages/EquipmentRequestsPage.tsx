import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { catalogsApi, equipmentRequestsApi, inventoryApi } from '../api'
import { EmptyState, ErrorNotice, formatDate, formatNumber, Loader, Modal } from '../components'
import type { Catalogo, Inventario, Paginated, SolicitudEquipo, Ubicacion } from '../types'
import type { ViewRole } from '../App'

const MINE_ACTOR = 'Almacenero de Mina · Simulación'
const LIMA_ACTOR = 'Logística Lima · Simulación'
const stateLabels = { ESPERA_APROBACION: 'Espera de aprobación', EN_CAMINO: 'En camino', RECIBIDO: 'Recibido' } as const
const calibrationLabels = { NO_CUMPLE: 'No cumple', SIN_CALIBRAR: 'Sin calibrar', CALIBRADO: 'Calibrado' } as const

function localDateTime() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function EquipmentRequestsPage({ role, notify }: { role: ViewRole; notify: (message: string, type?: 'success' | 'error') => void }) {
  const mine = role === 'almacenero'
  const [data, setData] = useState<Paginated<SolicitudEquipo> | null>(null)
  const [stateFilter, setStateFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<SolicitudEquipo | null>(null)
  const [receiving, setReceiving] = useState<SolicitudEquipo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setData(await equipmentRequestsApi.list({ page: 1, page_size: 50, estado: stateFilter, solicitante: mine ? MINE_ACTOR : '' }))
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.') }
    finally { setLoading(false) }
  }, [mine, stateFilter])
  useEffect(() => { void load() }, [load])

  const approve = async (item: SolicitudEquipo) => {
    if (!window.confirm(`¿Aprobar ${item.codigo} y marcar sus equipos en camino?`)) return
    try { await equipmentRequestsApi.approve(item.id, { usuario_nombre: LIMA_ACTOR }); notify(`${item.codigo} está en camino.`); await load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No se pudo aprobar.', 'error') }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">Flujo Mina → Lima</p><h1>Solicitudes de equipos</h1><p>{mine ? 'Registra envíos y sigue el estado de tus solicitudes.' : 'Aprueba envíos pendientes y confirma su recepción en Lima.'}</p></div>{mine && <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ Nueva solicitud</button>}</div>
    <div className="requests-toolbar card"><div><span className={`role-chip ${mine ? 'mine' : 'lima'}`}>{mine ? 'Vista Mina' : 'Vista Lima'}</span><small>{mine ? 'Solo solicitudes creadas en esta simulación' : 'Todas las solicitudes registradas'}</small></div><label><span>Estado</span><select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="">Todos</option><option value="ESPERA_APROBACION">Espera de aprobación</option><option value="EN_CAMINO">En camino</option><option value="RECIBIDO">Recibido</option></select></label></div>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading && !data ? <Loader /> : <section className="card table-card">
      <div className="table-summary"><strong>{data?.total ?? 0}</strong> solicitudes encontradas</div>
      <div className="table-responsive"><table><thead><tr><th>Solicitud</th><th>Ruta</th><th>Equipos</th><th>Envío</th><th>Estado</th><th /></tr></thead><tbody>
        {data?.items.map((item) => <tr key={item.id}><td><button className="item-title" onClick={() => setSelected(item)}>{item.codigo}</button><small className="item-subtitle">{item.solicitante_nombre}</small></td><td><strong>{item.ubicacion_origen.codigo}</strong><small className="item-subtitle">→ {item.ubicacion_destino.codigo}</small></td><td>{item.detalles.map((detail) => <div className="request-equipment" key={detail.id}><strong>{detail.inventario.descripcion}</strong><small>{formatNumber(detail.cantidad)} {detail.inventario.unidad_medida.codigo}</small></div>)}</td><td>{formatDate(item.fecha_envio, true)}<small className="item-subtitle">{item.guia || 'Sin guía'}</small></td><td><span className={`request-status status-${item.estado.toLowerCase()}`}>{stateLabels[item.estado]}</span></td><td className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => setSelected(item)}>Ver</button>{!mine && item.estado === 'ESPERA_APROBACION' && <button className="btn btn-secondary btn-sm" onClick={() => void approve(item)}>Aprobar</button>}{!mine && item.estado === 'EN_CAMINO' && <button className="btn btn-primary btn-sm" onClick={() => setReceiving(item)}>Recibir</button>}</td></tr>)}
      </tbody></table></div>
      {!data?.items.length && <EmptyState icon="⇢" title="No hay solicitudes" text={mine ? 'Registra el primer envío de equipos desde Mina.' : 'No existen solicitudes para el filtro seleccionado.'} />}
    </section>}
    {creating && <RequestForm onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); notify('Solicitud enviada a Logística Lima.'); await load() }} />}
    {selected && <RequestDetail item={selected} onClose={() => setSelected(null)} />}
    {receiving && <ReceiveForm item={receiving} onClose={() => setReceiving(null)} onSaved={async () => { setReceiving(null); notify('Recepción confirmada correctamente.'); await load() }} />}
  </>
}

function RequestForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [options, setOptions] = useState<{ equipment: Inventario[]; locations: Ubicacion[]; conditions: Catalogo[] }>({ equipment: [], locations: [], conditions: [] })
  const [form, setForm] = useState({ ubicacion_origen_id: '', ubicacion_destino_id: '', fecha_envio: localDateTime(), guia: '', transportista: '', inventario_id: '', cantidad: '1', condicion_salida_id: '', calibracion_salida: '', observaciones_salida: '', observaciones_equipo: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { Promise.all([inventoryApi.list({ estado: 'activos', page: 1, page_size: 500 }), catalogsApi.locations(), catalogsApi.conditions()]).then(([inventory, locations, conditions]) => setOptions({ equipment: inventory.items.filter((item) => item.categoria.nombre.trim().toUpperCase() === 'EQUIPOS'), locations, conditions })).catch((err) => setError(err instanceof Error ? err.message : 'No se cargaron las opciones.')) }, [])
  const selectedEquipment = options.equipment.find((item) => item.id === Number(form.inventario_id))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await equipmentRequestsApi.create({ ubicacion_origen_id: Number(form.ubicacion_origen_id), ubicacion_destino_id: Number(form.ubicacion_destino_id), fecha_envio: new Date(form.fecha_envio).toISOString(), guia: form.guia.trim() || null, transportista: form.transportista.trim() || null, solicitante_nombre: MINE_ACTOR, observaciones_salida: form.observaciones_salida.trim() || null, detalles: [{ inventario_id: Number(form.inventario_id), cantidad: form.cantidad, condicion_salida_id: form.condicion_salida_id ? Number(form.condicion_salida_id) : null, calibracion_salida: form.calibracion_salida || selectedEquipment?.calibracion || null, observaciones: form.observaciones_equipo.trim() || null }] }); await onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar la solicitud.') }
    finally { setSaving(false) }
  }
  return <Modal wide title="Nueva solicitud de equipo" subtitle="Registra la constancia inicial del envío desde Mina." onClose={onClose}>{error && <ErrorNotice message={error} />}<form className="form-grid" onSubmit={submit}>
    <Field label="Origen" required><select value={form.ubicacion_origen_id} onChange={(e) => setForm({ ...form, ubicacion_origen_id: e.target.value })} required><option value="">Seleccionar</option>{options.locations.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.almacen.nombre}</option>)}</select></Field>
    <Field label="Destino" required><select value={form.ubicacion_destino_id} onChange={(e) => setForm({ ...form, ubicacion_destino_id: e.target.value })} required><option value="">Seleccionar</option>{options.locations.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.almacen.nombre}</option>)}</select></Field>
    <Field label="Fecha y hora de envío" required><input type="datetime-local" value={form.fecha_envio} onChange={(e) => setForm({ ...form, fecha_envio: e.target.value })} required /></Field>
    <Field label="Equipo" required className="span-2"><select value={form.inventario_id} onChange={(e) => { const item = options.equipment.find((x) => x.id === Number(e.target.value)); setForm({ ...form, inventario_id: e.target.value, calibracion_salida: item?.calibracion ?? '' }) }} required><option value="">Seleccionar equipo</option>{options.equipment.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.descripcion} ({formatNumber(x.stock_actual)} {x.unidad_medida.codigo})</option>)}</select></Field>
    <Field label="Cantidad" required><input type="number" min="0.001" step="0.001" max={selectedEquipment?.stock_actual} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required /></Field>
    <Field label="Condición de salida"><select value={form.condicion_salida_id} onChange={(e) => setForm({ ...form, condicion_salida_id: e.target.value })}><option value="">Sin condición</option>{options.conditions.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
    <Field label="Calibración de salida"><select value={form.calibracion_salida} onChange={(e) => setForm({ ...form, calibracion_salida: e.target.value })}><option value="">Sin registro</option><option value="NO_CUMPLE">No cumple</option><option value="SIN_CALIBRAR">Sin calibrar</option><option value="CALIBRADO">Calibrado</option></select></Field>
    <Field label="Guía o documento"><input value={form.guia} onChange={(e) => setForm({ ...form, guia: e.target.value })} /></Field>
    <Field label="Transportista"><input value={form.transportista} onChange={(e) => setForm({ ...form, transportista: e.target.value })} /></Field>
    <Field label="Detalle del equipo" className="span-3"><textarea rows={2} value={form.observaciones_equipo} onChange={(e) => setForm({ ...form, observaciones_equipo: e.target.value })} /></Field>
    <Field label="Observaciones del envío" className="span-3"><textarea rows={3} value={form.observaciones_salida} onChange={(e) => setForm({ ...form, observaciones_salida: e.target.value })} /></Field>
    <div className="form-actions span-3"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'}</button></div>
  </form></Modal>
}

function RequestDetail({ item, onClose }: { item: SolicitudEquipo; onClose: () => void }) {
  return <Modal wide title={item.codigo} subtitle={`${item.ubicacion_origen.codigo} → ${item.ubicacion_destino.codigo}`} onClose={onClose}><div className="request-detail"><div className="request-detail-summary"><span className={`request-status status-${item.estado.toLowerCase()}`}>{stateLabels[item.estado]}</span><div><small>Solicitante</small><strong>{item.solicitante_nombre}</strong></div><div><small>Fecha de envío</small><strong>{formatDate(item.fecha_envio, true)}</strong></div><div><small>Guía</small><strong>{item.guia || 'Sin guía'}</strong></div></div><h3>Equipos</h3>{item.detalles.map((detail) => <div className="request-detail-equipment" key={detail.id}><div><strong>{detail.inventario.descripcion}</strong><small>{detail.inventario.codigo}</small></div><span>{formatNumber(detail.cantidad)} {detail.inventario.unidad_medida.codigo}</span><span>{detail.condicion_salida?.nombre || 'Sin condición'}</span><span>{detail.calibracion_salida ? calibrationLabels[detail.calibracion_salida] : 'Sin calibración'}</span></div>)}<h3>Historial</h3><div className="request-history">{[...item.historial].sort((a, b) => a.creado_en.localeCompare(b.creado_en)).map((entry) => <div key={entry.id}><span /><div><strong>{stateLabels[entry.estado_nuevo]}</strong><small>{entry.usuario_nombre} · {formatDate(entry.creado_en, true)}</small>{entry.comentario && <p>{entry.comentario}</p>}</div></div>)}</div></div></Modal>
}

function ReceiveForm({ item, onClose, onSaved }: { item: SolicitudEquipo; onClose: () => void; onSaved: () => Promise<void> }) {
  const [conditions, setConditions] = useState<Catalogo[]>([])
  const [entries, setEntries] = useState<Record<number, { condicion: string; calibracion: string }>>(() => Object.fromEntries(item.detalles.map((x) => [x.id, { condicion: '', calibracion: x.calibracion_salida ?? '' }])))
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { catalogsApi.conditions().then(setConditions).catch(() => setConditions([])) }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { await equipmentRequestsApi.receive(item.id, { usuario_nombre: LIMA_ACTOR, comentario: comment.trim() || null, detalles: item.detalles.map((x) => ({ detalle_id: x.id, condicion_recepcion_id: entries[x.id].condicion ? Number(entries[x.id].condicion) : null, calibracion_recepcion: entries[x.id].calibracion || null })) }); await onSaved() } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar la recepción.') } finally { setSaving(false) } }
  return <Modal wide title={`Recibir ${item.codigo}`} subtitle="Confirma la condición y calibración observadas al llegar a Lima." onClose={onClose}>{error && <ErrorNotice message={error} />}<form className="receive-form" onSubmit={submit}>{item.detalles.map((detail) => <section className="receive-equipment" key={detail.id}><header><div><strong>{detail.inventario.descripcion}</strong><small>{detail.inventario.codigo}</small></div><span>{formatNumber(detail.cantidad)} {detail.inventario.unidad_medida.codigo}</span></header><div><Field label="Condición de recepción"><select value={entries[detail.id].condicion} onChange={(e) => setEntries({ ...entries, [detail.id]: { ...entries[detail.id], condicion: e.target.value } })}><option value="">Sin condición</option>{conditions.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field><Field label="Calibración de recepción"><select value={entries[detail.id].calibracion} onChange={(e) => setEntries({ ...entries, [detail.id]: { ...entries[detail.id], calibracion: e.target.value } })}><option value="">Sin registro</option><option value="NO_CUMPLE">No cumple</option><option value="SIN_CALIBRAR">Sin calibrar</option><option value="CALIBRADO">Calibrado</option></select></Field></div></section>)}<Field label="Observaciones de recepción"><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field><div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Confirmando…' : 'Confirmar recepción'}</button></div></form></Modal>
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`field ${className}`}><span>{label}{required && <b>*</b>}</span>{children}</label>
}

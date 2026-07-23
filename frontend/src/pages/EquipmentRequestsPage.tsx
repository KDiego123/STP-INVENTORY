import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { catalogsApi, equipmentRequestsApi, inventoryApi } from '../api'
import { EmptyState, ErrorNotice, formatDate, formatNumber, Loader, Modal } from '../components'
import { SignaturePad } from '../components/SignaturePad'
import type { Catalogo, Inventario, Paginated, SolicitudEquipo, Ubicacion, Unidad } from '../types'
import type { ViewRole } from '../App'

const MINE_ACTOR = 'Almacenero de Mina · Simulación'
const LIMA_ACTOR = 'Logística Lima · Simulación'
const stateLabels = { ESPERA_APROBACION: 'Espera de aprobación', EN_CAMINO: 'En camino', RECIBIDO: 'Recibido' } as const
const calibrationLabels = { NO_CUMPLE: 'No cumple', SIN_CALIBRAR: 'Sin calibrar', CALIBRADO: 'Calibrado' } as const

type RequestDetailDraft = {
  nombre_equipo: string
  marca: string
  modelo: string
  numero_serie: string
  codigo_patrimonial: string
  unidad_medida_id: string
  cantidad: string
  condicion_salida_id: string
  calibracion_salida: string
  fecha_calibracion_salida: string
  observaciones: string
}

type ReceptionDraft = {
  accion: 'CREAR' | 'VINCULAR'
  inventario_id: string
  codigo_inventario: string
  condicion: string
  calibracion: string
  fecha_calibracion: string
}

const newDetail = (unitId = ''): RequestDetailDraft => ({
  nombre_equipo: '',
  marca: '',
  modelo: '',
  numero_serie: '',
  codigo_patrimonial: '',
  unidad_medida_id: unitId,
  cantidad: '1',
  condicion_salida_id: '',
  calibracion_salida: '',
  fecha_calibracion_salida: '',
  observaciones: '',
})

function localDateTime() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function sequentialCode(base: string, offset: number) {
  const match = base.match(/^(.*?)(\d+)$/)
  if (!match) return ''
  return `${match[1]}${String(Number(match[2]) + offset).padStart(match[2].length, '0')}`
}

export function EquipmentRequestsPage({ role, notify }: { role: ViewRole; notify: (message: string, type?: 'success' | 'error') => void }) {
  const mine = role === 'almacenero'
  const [data, setData] = useState<Paginated<SolicitudEquipo> | null>(null)
  const [stateFilter, setStateFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<SolicitudEquipo | null>(null)
  const [approvalPending, setApprovalPending] = useState<SolicitudEquipo | null>(null)
  const [approving, setApproving] = useState(false)
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

  const approve = async () => {
    if (!approvalPending) return
    setApproving(true)
    try {
      await equipmentRequestsApi.approve(approvalPending.id, { usuario_nombre: LIMA_ACTOR })
      notify(`${approvalPending.codigo} está en camino.`)
      setApprovalPending(null)
      setSelected(null)
      await load()
    }
    catch (err) { notify(err instanceof Error ? err.message : 'No se pudo aprobar.', 'error') }
    finally { setApproving(false) }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">Flujo Mina → Lima</p><h1>Solicitudes de equipos</h1><p>{mine ? 'Registra equipos nuevos y sigue el estado de sus envíos.' : 'Aprueba preingresos y confirma su incorporación al inventario.'}</p></div>{mine && <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ Nueva solicitud</button>}</div>
    <div className="requests-toolbar card"><div><span className={`role-chip ${mine ? 'mine' : 'lima'}`}>{mine ? 'Vista Mina' : 'Vista Lima'}</span><small>{mine ? 'Tus preingresos simulados' : 'Todas las solicitudes registradas'}</small></div><label><span>Estado</span><select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="">Todos</option><option value="ESPERA_APROBACION">Espera de aprobación</option><option value="EN_CAMINO">En camino</option><option value="RECIBIDO">Recibido</option></select></label></div>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading && !data ? <Loader /> : <section className="card table-card">
      <div className="table-summary"><strong>{data?.total ?? 0}</strong> solicitudes encontradas</div>
      <div className="table-responsive"><table><thead><tr><th>Solicitud</th><th>Ruta</th><th>Equipos</th><th>Envío</th><th>Estado</th><th /></tr></thead><tbody>
        {data?.items.map((item) => <tr key={item.id}><td><button className="item-title" onClick={() => setSelected(item)}>{item.codigo}</button><small className="item-subtitle">{item.solicitante_nombre}</small></td><td><strong>{item.ubicacion_origen.codigo}</strong><small className="item-subtitle">→ {item.ubicacion_destino.codigo}</small></td><td>{item.detalles.map((detail) => <div className="request-equipment" key={detail.id}><strong>{detail.nombre_equipo}</strong><small>{formatNumber(detail.cantidad)} {detail.unidad_medida.codigo}</small></div>)}</td><td>{formatDate(item.fecha_envio, true)}<small className="item-subtitle">{item.guia || 'Sin guía'}</small></td><td><span className={`request-status status-${item.estado.toLowerCase()}`}>{stateLabels[item.estado]}</span></td><td className="row-actions"><button className="btn btn-ghost btn-sm" onClick={() => setSelected(item)}>Ver</button>{!mine && item.estado === 'ESPERA_APROBACION' && <button className="btn btn-secondary btn-sm" onClick={() => setApprovalPending(item)}>Aprobar</button>}{!mine && item.estado === 'EN_CAMINO' && <button className="btn btn-primary btn-sm" onClick={() => setReceiving(item)}>Recibir e ingresar</button>}</td></tr>)}
      </tbody></table></div>
      {!data?.items.length && <EmptyState icon="⇢" title="No hay solicitudes" text={mine ? 'Registra el primer envío de equipos nuevos desde Mina.' : 'No existen solicitudes para el filtro seleccionado.'} />}
    </section>}
    {creating && <RequestForm onClose={() => { setCreating(false); void load() }} onSaved={async () => { setCreating(false); notify('Solicitud enviada a Logística Lima.'); await load() }} />}
    {selected && <RequestDetail
      item={selected}
      mine={mine}
      onClose={() => setSelected(null)}
      onApprove={() => setApprovalPending(selected)}
      onReceive={() => { setSelected(null); setReceiving(selected) }}
    />}
    {approvalPending && <ApprovalConfirmation item={approvalPending} saving={approving} onClose={() => !approving && setApprovalPending(null)} onConfirm={() => void approve()} />}
    {receiving && <ReceiveForm item={receiving} onClose={() => setReceiving(null)} onSaved={async () => { setReceiving(null); notify('Equipos incorporados al inventario correctamente.'); await load() }} />}
  </>
}

function RequestForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [options, setOptions] = useState<{ locations: Ubicacion[]; conditions: Catalogo[]; units: Unidad[] }>({ locations: [], conditions: [], units: [] })
  const [form, setForm] = useState({ ubicacion_origen_id: '', ubicacion_destino_id: '', fecha_envio: localDateTime(), guia: '', transportista: '', observaciones_salida: '' })
  const [details, setDetails] = useState<RequestDetailDraft[]>([newDetail()])
  const [documents, setDocuments] = useState<File[]>([])
  const [senderSignature, setSenderSignature] = useState<File | null>(null)
  const [createdRequest, setCreatedRequest] = useState<SolicitudEquipo | null>(null)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([catalogsApi.locations(), catalogsApi.conditions(), catalogsApi.units()])
      .then(([locations, conditions, units]) => {
        setOptions({ locations, conditions, units })
        const unit = units.find((item) => item.codigo.toUpperCase() === 'UND') ?? units.find((item) => !item.permite_decimal)
        if (unit) setDetails((current) => current.map((item) => item.unidad_medida_id ? item : { ...item, unidad_medida_id: String(unit.id) }))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se cargaron las opciones.'))
  }, [])

  const updateDetail = (index: number, key: keyof RequestDetailDraft, value: string) => {
    setDetails((current) => current.map((item, position) => position === index ? { ...item, [key]: value } : item))
  }
  const addDetail = () => setDetails((current) => [...current, newDetail(current[0]?.unidad_medida_id)])
  const removeDetail = (index: number) => setDetails((current) => current.filter((_, position) => position !== index))

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      setProgress(createdRequest ? 'Reanudando la carga de archivos…' : 'Creando la solicitud…')
      const solicitud = createdRequest ?? await equipmentRequestsApi.create({
        ubicacion_origen_id: Number(form.ubicacion_origen_id),
        ubicacion_destino_id: Number(form.ubicacion_destino_id),
        fecha_envio: new Date(form.fecha_envio).toISOString(),
        guia: form.guia.trim() || null,
        transportista: form.transportista.trim() || null,
        solicitante_nombre: MINE_ACTOR,
        observaciones_salida: form.observaciones_salida.trim() || null,
        detalles: details.map((detail) => ({
          nombre_equipo: detail.nombre_equipo.trim(),
          marca: detail.marca.trim() || null,
          modelo: detail.modelo.trim() || null,
          numero_serie: detail.numero_serie.trim() || null,
          codigo_patrimonial: detail.codigo_patrimonial.trim() || null,
          unidad_medida_id: Number(detail.unidad_medida_id),
          cantidad: Number(detail.cantidad),
          condicion_salida_id: detail.condicion_salida_id ? Number(detail.condicion_salida_id) : null,
          calibracion_salida: detail.calibracion_salida || null,
          fecha_calibracion_salida: detail.fecha_calibracion_salida || null,
          observaciones: detail.observaciones.trim() || null,
        })),
      })
      if (!createdRequest) setCreatedRequest(solicitud)
      const pendingDocuments = [...documents]
      for (const [index, document] of pendingDocuments.entries()) {
        setProgress(`Subiendo PDF ${index + 1} de ${pendingDocuments.length}…`)
        await equipmentRequestsApi.uploadFile(solicitud.id, 'DOCUMENTO', document, MINE_ACTOR)
        setDocuments((current) => current.filter((item) => item !== document))
      }
      if (senderSignature) {
        setProgress('Guardando la firma del remitente…')
        await equipmentRequestsApi.uploadFile(solicitud.id, 'FIRMA_REMITENTE', senderSignature, MINE_ACTOR)
        setSenderSignature(null)
      }
      setProgress('Finalizando el registro…')
      await onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar la solicitud.') }
    finally { setSaving(false); setProgress('') }
  }

  return <>{saving && <ProcessingOverlay title="Registrando solicitud" detail={progress || 'Procesando información…'} />}
  <Modal wide title="Nueva solicitud de equipo" subtitle="Registra equipos nuevos enviados desde Mina; Logística los incorporará al recibirlos." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    <form className="request-create-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Origen" required><select value={form.ubicacion_origen_id} onChange={(e) => setForm({ ...form, ubicacion_origen_id: e.target.value })} required><option value="">Seleccionar</option>{options.locations.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.almacen.nombre}</option>)}</select></Field>
        <Field label="Destino previsto" required><select value={form.ubicacion_destino_id} onChange={(e) => setForm({ ...form, ubicacion_destino_id: e.target.value })} required><option value="">Seleccionar</option>{options.locations.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.almacen.nombre}</option>)}</select></Field>
        <Field label="Fecha y hora de envío" required><input type="datetime-local" value={form.fecha_envio} onChange={(e) => setForm({ ...form, fecha_envio: e.target.value })} required /></Field>
        <Field label="Guía o documento"><input value={form.guia} onChange={(e) => setForm({ ...form, guia: e.target.value })} /></Field>
        <Field label="Transportista"><input value={form.transportista} onChange={(e) => setForm({ ...form, transportista: e.target.value })} /></Field>
      </div>

      <div className="request-items-heading"><div><strong>Equipos del envío</strong><small>Agrega una línea por equipo o grupo de equipos iguales.</small></div><button type="button" className="btn btn-secondary" onClick={addDetail}>＋ Agregar equipo</button></div>
      <div className="request-items">
        {details.map((detail, index) => <section className="request-item-card" key={index}>
          <header><div><span>{index + 1}</span><strong>Equipo {index + 1}</strong></div>{details.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDetail(index)}>Quitar</button>}</header>
          <div className="form-grid">
            <Field label="Nombre o descripción" required className="span-2"><input value={detail.nombre_equipo} onChange={(e) => updateDetail(index, 'nombre_equipo', e.target.value)} placeholder="Ej. Detector multigás portátil" required /></Field>
            <Field label="Cantidad" required><input type="number" min="1" step="1" value={detail.cantidad} onChange={(e) => updateDetail(index, 'cantidad', e.target.value)} required /></Field>
            <Field label="Unidad" required><select value={detail.unidad_medida_id} onChange={(e) => updateDetail(index, 'unidad_medida_id', e.target.value)} required><option value="">Seleccionar</option>{options.units.filter((item) => !item.permite_decimal).map((item) => <option key={item.id} value={item.id}>{item.nombre} ({item.codigo})</option>)}</select></Field>
            <Field label="Marca"><input value={detail.marca} onChange={(e) => updateDetail(index, 'marca', e.target.value)} /></Field>
            <Field label="Modelo"><input value={detail.modelo} onChange={(e) => updateDetail(index, 'modelo', e.target.value)} /></Field>
            <Field label="Número de serie"><input value={detail.numero_serie} onChange={(e) => updateDetail(index, 'numero_serie', e.target.value)} /></Field>
            <Field label="Código patrimonial"><input value={detail.codigo_patrimonial} onChange={(e) => updateDetail(index, 'codigo_patrimonial', e.target.value)} /></Field>
            <Field label="Condición de salida"><select value={detail.condicion_salida_id} onChange={(e) => updateDetail(index, 'condicion_salida_id', e.target.value)}><option value="">Sin condición</option>{options.conditions.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></Field>
            <Field label="Calibración de salida" required><select value={detail.calibracion_salida} onChange={(e) => { updateDetail(index, 'calibracion_salida', e.target.value); if (e.target.value !== 'CALIBRADO') updateDetail(index, 'fecha_calibracion_salida', '') }} required><option value="">Seleccionar</option><option value="NO_CUMPLE">No cumple</option><option value="SIN_CALIBRAR">Sin calibrar</option><option value="CALIBRADO">Calibrado</option></select></Field>
            <Field label="Fecha de calibración" required={detail.calibracion_salida === 'CALIBRADO'}><input type="date" value={detail.fecha_calibracion_salida} onChange={(e) => updateDetail(index, 'fecha_calibracion_salida', e.target.value)} disabled={detail.calibracion_salida !== 'CALIBRADO'} required={detail.calibracion_salida === 'CALIBRADO'} /></Field>
            <Field label="Observaciones del equipo" className="span-3"><textarea rows={2} value={detail.observaciones} onChange={(e) => updateDetail(index, 'observaciones', e.target.value)} /></Field>
          </div>
          {Number(detail.cantidad) > 1 && (detail.numero_serie || detail.codigo_patrimonial) && <p className="field-hint">Si las unidades tienen series o códigos patrimoniales diferentes, agrégalas como líneas separadas.</p>}
        </section>)}
      </div>
      <Field label="Observaciones generales del envío"><textarea rows={3} value={form.observaciones_salida} onChange={(e) => setForm({ ...form, observaciones_salida: e.target.value })} /></Field>
      <section className="request-attachments">
        <div className="request-items-heading"><div><strong>Documentos y firma</strong><small>Los PDF y la firma se guardarán en el expediente privado de la solicitud.</small></div></div>
        <label className="file-drop">
          <span>Adjuntar documentos PDF</span>
          <small>Hasta 10 archivos de 20 MB cada uno.</small>
          <input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => setDocuments(Array.from(event.target.files ?? []).slice(0, 10))} />
        </label>
        {!!documents.length && <div className="selected-files">{documents.map((file, index) => <div key={`${file.name}-${index}`}><span>PDF</span><strong>{file.name}</strong><button type="button" onClick={() => setDocuments((current) => current.filter((_, position) => position !== index))}>×</button></div>)}</div>}
        <div className="signature-options">
          <SignaturePad onChange={setSenderSignature} disabled={saving} />
          <label className="signature-upload"><strong>O subir firma PNG</strong><small>Selecciona una imagen existente de máximo 5 MB.</small><input type="file" accept="image/png,.png" onChange={(event) => setSenderSignature(event.target.files?.[0] ?? null)} /></label>
        </div>
        {senderSignature && <p className="signature-ready">✓ Firma del remitente preparada: {senderSignature.name}</p>}
        {createdRequest && <p className="field-hint">La solicitud {createdRequest.codigo} ya fue creada. Si una carga falló, vuelve a enviar para continuar con los archivos pendientes sin duplicarla.</p>}
      </section>
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : `Enviar solicitud con ${details.length} equipo${details.length === 1 ? '' : 's'}`}</button></div>
    </form>
  </Modal>
  </>
}

function RequestDetail({ item, mine, onClose, onApprove, onReceive }: {
  item: SolicitudEquipo
  mine: boolean
  onClose: () => void
  onApprove: () => void
  onReceive: () => void
}) {
  return <Modal wide title={item.codigo} subtitle={`${item.ubicacion_origen.codigo} → ${item.ubicacion_destino.codigo}`} onClose={onClose}>
    <div className="request-detail">
      <div className="request-detail-summary"><span className={`request-status status-${item.estado.toLowerCase()}`}>{stateLabels[item.estado]}</span><div><small>Solicitante</small><strong>{item.solicitante_nombre}</strong></div><div><small>Fecha de envío</small><strong>{formatDate(item.fecha_envio, true)}</strong></div><div><small>Guía</small><strong>{item.guia || 'Sin guía'}</strong></div></div>
      <h3>Equipos</h3>
      {item.detalles.map((detail) => <div className="request-detail-equipment" key={detail.id}><div><strong>{detail.nombre_equipo}</strong><small>{[detail.marca, detail.modelo].filter(Boolean).join(' · ') || 'Sin marca/modelo'}{detail.inventario ? ` · ${detail.inventario.codigo}` : ' · Preingreso'}</small></div><span>{formatNumber(detail.cantidad)} {detail.unidad_medida.codigo}</span><span>{detail.numero_serie || detail.codigo_patrimonial || 'Sin identificación'}</span><span>{detail.condicion_salida?.nombre || 'Sin condición'} · {detail.calibracion_salida ? calibrationLabels[detail.calibracion_salida] : 'Sin calibración'}</span></div>)}
      <h3>Documentos y firmas</h3>
      {item.archivos.length ? <div className="request-files">{item.archivos.map((file) => <a key={file.id} href={equipmentRequestsApi.fileUrl(item.id, file.id)} target="_blank" rel="noreferrer" className={file.tipo === 'DOCUMENTO' ? '' : 'signature-file'}>{file.tipo === 'DOCUMENTO' ? <span>PDF</span> : <img src={equipmentRequestsApi.fileUrl(item.id, file.id)} alt={file.tipo === 'FIRMA_REMITENTE' ? 'Firma del remitente' : 'Firma del receptor'} />}<div><strong>{file.tipo === 'DOCUMENTO' ? file.nombre_original : file.tipo === 'FIRMA_REMITENTE' ? 'Firma del remitente' : 'Firma del receptor'}</strong><small>{formatDate(file.creado_en, true)} · {(file.tamano_bytes / 1024).toFixed(1)} KB</small></div></a>)}</div> : <p className="request-files-empty">No se adjuntaron documentos ni firmas.</p>}
      <h3>Historial</h3>
      <div className="request-history">{[...item.historial].sort((a, b) => a.creado_en.localeCompare(b.creado_en)).map((entry) => <div key={entry.id}><span /><div><strong>{stateLabels[entry.estado_nuevo]}</strong><small>{entry.usuario_nombre} · {formatDate(entry.creado_en, true)}</small>{entry.comentario && <p>{entry.comentario}</p>}</div></div>)}</div>
      <div className="request-detail-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        {!mine && item.estado === 'ESPERA_APROBACION' && <button type="button" className="btn btn-secondary" onClick={onApprove}>Aprobar y enviar</button>}
        {!mine && item.estado === 'EN_CAMINO' && <button type="button" className="btn btn-primary" onClick={onReceive}>Recibir e ingresar</button>}
      </div>
    </div>
  </Modal>
}

function ApprovalConfirmation({ item, saving, onClose, onConfirm }: {
  item: SolicitudEquipo
  saving: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const total = item.detalles.reduce((sum, detail) => sum + Number(detail.cantidad), 0)
  return <Modal title="Confirmar aprobación" subtitle="Revisa el envío antes de cambiar su estado." onClose={onClose}>
    <div className="approval-confirmation">
      <div className="approval-confirmation-icon" aria-hidden="true">→</div>
      <div>
        <span className="request-status status-espera_aprobacion">Espera de aprobación</span>
        <h3>¿Aprobar {item.codigo}?</h3>
        <p>Los equipos quedarán marcados como <strong>En camino</strong> y Logística podrá registrar su recepción.</p>
      </div>
    </div>
    <div className="approval-confirmation-summary">
      <div><small>Ruta</small><strong>{item.ubicacion_origen.codigo} → {item.ubicacion_destino.codigo}</strong></div>
      <div><small>Equipos</small><strong>{item.detalles.length} línea{item.detalles.length === 1 ? '' : 's'} · {formatNumber(total)} unidad{total === 1 ? '' : 'es'}</strong></div>
      <div><small>Fecha de envío</small><strong>{formatDate(item.fecha_envio, true)}</strong></div>
    </div>
    <div className="approval-confirmation-notice">
      <span>i</span>
      <p>Esta acción se registrará en el historial de la solicitud.</p>
    </div>
    <div className="form-actions">
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving}>{saving ? 'Aprobando…' : 'Sí, aprobar envío'}</button>
    </div>
  </Modal>
}

function ReceiveForm({ item, onClose, onSaved }: { item: SolicitudEquipo; onClose: () => void; onSaved: () => Promise<void> }) {
  const initialEntries = Object.fromEntries(item.detalles.map((detail) => [detail.id, {
    accion: detail.inventario ? 'VINCULAR' : 'CREAR',
    inventario_id: detail.inventario ? String(detail.inventario.id) : '',
    codigo_inventario: '',
    condicion: '',
    calibracion: detail.calibracion_salida ?? '',
    fecha_calibracion: detail.fecha_calibracion_salida ?? '',
  }])) as Record<number, ReceptionDraft>
  const [conditions, setConditions] = useState<Catalogo[]>([])
  const [inventory, setInventory] = useState<Inventario[]>([])
  const [entries, setEntries] = useState<Record<number, ReceptionDraft>>(initialEntries)
  const [comment, setComment] = useState('')
  const [receiverSignature, setReceiverSignature] = useState<File | null>(null)
  const [signatureUploaded, setSignatureUploaded] = useState(item.archivos.some((file) => file.tipo === 'FIRMA_RECEPTOR'))
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([catalogsApi.conditions(), inventoryApi.list({ estado: 'activos', page: 1, page_size: 500 }), inventoryApi.nextCode()])
      .then(([conditionOptions, inventoryResult, next]) => {
        setConditions(conditionOptions)
        setInventory(inventoryResult.items.filter((candidate) => candidate.categoria.nombre.trim().toUpperCase() === 'EQUIPO' && candidate.ubicacion_id === item.ubicacion_destino.id))
        setEntries((current) => Object.fromEntries(item.detalles.map((detail, index) => [detail.id, { ...current[detail.id], codigo_inventario: current[detail.id].codigo_inventario || sequentialCode(next.codigo, index) }])) as Record<number, ReceptionDraft>)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se cargaron las opciones de recepción.'))
  }, [item])

  const update = (id: number, values: Partial<ReceptionDraft>) => setEntries((current) => ({ ...current, [id]: { ...current[id], ...values } }))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      if (receiverSignature && !signatureUploaded) {
        setProgress('Guardando la firma del receptor…')
        await equipmentRequestsApi.uploadFile(item.id, 'FIRMA_RECEPTOR', receiverSignature, LIMA_ACTOR)
        setSignatureUploaded(true)
      }
      setProgress('Actualizando inventario y movimientos…')
      await equipmentRequestsApi.receive(item.id, {
        usuario_nombre: LIMA_ACTOR,
        comentario: comment.trim() || null,
        detalles: item.detalles.map((detail) => ({
          detalle_id: detail.id,
          accion_inventario: entries[detail.id].accion,
          inventario_id: entries[detail.id].accion === 'VINCULAR' ? Number(entries[detail.id].inventario_id) : null,
          codigo_inventario: entries[detail.id].accion === 'CREAR' ? entries[detail.id].codigo_inventario.trim() || null : null,
          condicion_recepcion_id: entries[detail.id].condicion ? Number(entries[detail.id].condicion) : null,
          calibracion_recepcion: entries[detail.id].calibracion || null,
          fecha_calibracion_recepcion: entries[detail.id].fecha_calibracion || null,
        })),
      })
      setProgress('Finalizando la recepción…')
      await onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar la recepción.') }
    finally { setSaving(false); setProgress('') }
  }

  return <>{saving && <ProcessingOverlay title="Procesando recepción" detail={progress || 'Procesando información…'} />}
  <Modal wide title={`Recibir ${item.codigo}`} subtitle="Confirma los datos y crea o vincula cada equipo en el inventario de Lima." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    <form className="receive-form" onSubmit={submit}>
      {item.detalles.map((detail) => {
        const entry = entries[detail.id]
        return <section className="receive-equipment" key={detail.id}>
          <header><div><strong>{detail.nombre_equipo}</strong><small>{[detail.marca, detail.modelo, detail.numero_serie].filter(Boolean).join(' · ') || 'Sin identificación adicional'}</small></div><span>{formatNumber(detail.cantidad)} {detail.unidad_medida.codigo}</span></header>
          <div className="receive-equipment-fields">
            <Field label="Acción de inventario" required><select value={entry.accion} onChange={(e) => update(detail.id, { accion: e.target.value as ReceptionDraft['accion'], inventario_id: '' })}><option value="CREAR">Crear artículo nuevo</option><option value="VINCULAR">Vincular artículo existente</option></select></Field>
            {entry.accion === 'CREAR'
              ? <Field label="Código de inventario"><input value={entry.codigo_inventario} onChange={(e) => update(detail.id, { codigo_inventario: e.target.value.toUpperCase() })} placeholder="Automático si se deja vacío" /></Field>
              : <Field label="Artículo existente" required><select value={entry.inventario_id} onChange={(e) => update(detail.id, { inventario_id: e.target.value })} required><option value="">Seleccionar</option>{inventory.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.codigo} · {candidate.descripcion}</option>)}</select></Field>}
            <Field label="Condición de recepción"><select value={entry.condicion} onChange={(e) => update(detail.id, { condicion: e.target.value })}><option value="">Conservar condición de salida</option>{conditions.map((condition) => <option key={condition.id} value={condition.id}>{condition.nombre}</option>)}</select></Field>
            <Field label="Calibración de recepción"><select value={entry.calibracion} onChange={(e) => update(detail.id, { calibracion: e.target.value, fecha_calibracion: e.target.value === 'CALIBRADO' ? entry.fecha_calibracion : '' })}><option value="">Conservar dato de salida</option><option value="NO_CUMPLE">No cumple</option><option value="SIN_CALIBRAR">Sin calibrar</option><option value="CALIBRADO">Calibrado</option></select></Field>
            <Field label="Fecha de calibración" required={entry.calibracion === 'CALIBRADO'}><input type="date" value={entry.fecha_calibracion} onChange={(e) => update(detail.id, { fecha_calibracion: e.target.value })} disabled={entry.calibracion !== 'CALIBRADO'} required={entry.calibracion === 'CALIBRADO'} /></Field>
          </div>
        </section>
      })}
      <Field label="Observaciones de recepción"><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <section className="request-attachments">
        <div className="request-items-heading"><div><strong>Conformidad del receptor</strong><small>Firma en la pantalla o adjunta un PNG existente.</small></div></div>
        {signatureUploaded ? <p className="signature-ready">✓ La firma del receptor ya está almacenada.</p> : <>
          <div className="signature-options">
            <SignaturePad onChange={setReceiverSignature} disabled={saving} />
            <label className="signature-upload"><strong>O subir firma PNG</strong><small>Selecciona una imagen existente de máximo 5 MB.</small><input type="file" accept="image/png,.png" onChange={(event) => setReceiverSignature(event.target.files?.[0] ?? null)} /></label>
          </div>
          {receiverSignature && <p className="signature-ready">✓ Firma preparada: {receiverSignature.name}</p>}
        </>}
      </section>
      <div className="inventory-entry-notice"><strong>Esta confirmación modifica inventario.</strong><span>Se creará una entrada por cada equipo y la operación quedará vinculada a {item.codigo}.</span></div>
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Confirmando…' : 'Confirmar recepción e ingreso'}</button></div>
    </form>
  </Modal>
  </>
}

function ProcessingOverlay({ title, detail }: { title: string; detail: string }) {
  return <div className="processing-backdrop" role="status" aria-live="polite" aria-busy="true">
    <div className="processing-card">
      <span className="processing-spinner" aria-hidden="true" />
      <div><strong>{title}</strong><p>{detail}</p></div>
      <small>No cierres esta ventana mientras termina la operación.</small>
    </div>
  </div>
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`field ${className}`}><span>{label}{required && <b>*</b>}</span>{children}</label>
}

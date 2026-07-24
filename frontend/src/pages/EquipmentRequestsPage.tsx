import { type FormEvent, useCallback, useEffect, useState } from 'react'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import EastIcon from '@mui/icons-material/East'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { ApiError, catalogsApi, equipmentRequestsApi, inventoryApi } from '../api'
import { EmptyState, ErrorNotice, formatDate, formatNumber, Loader, Modal } from '../components'
import { SignatureInput } from '../components/SignaturePad'
import type { Catalogo, Inventario, Paginated, SolicitudEquipo, Ubicacion, Unidad } from '../types'
import type { ViewRole } from '../App'

const MINE_ACTOR = 'Almacenero de Mina · Simulación'
const LIMA_ACTOR = 'Logística Lima · Simulación'
const stateLabels = { ESPERA_APROBACION: 'Espera de aprobación', EN_CAMINO: 'En camino', RECIBIDO: 'Recibido', RECHAZADO: 'No aprobado' } as const
const calibrationLabels = { NO_CUMPLE: 'No aplica', SIN_CALIBRAR: 'Sin calibrar', CALIBRADO: 'Calibrado' } as const

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

type RequestHeaderDraft = {
  ubicacion_origen_id: string
  ubicacion_destino_id: string
  fecha_envio: string
  guia: string
  transportista: string
  observaciones_salida: string
}

const REQUEST_DRAFT_KEY = 'inventory-equipment-request-draft'

function readRequestDraft(): { form: RequestHeaderDraft; details: RequestDetailDraft[]; collapsed: boolean[] } | null {
  try {
    const value = localStorage.getItem(REQUEST_DRAFT_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
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

function isNextcloudUnavailable(error: unknown) {
  return error instanceof ApiError && error.status === 503
}

function conditionDisplayName(name: string | null | undefined) {
  const normalized = name?.trim().toUpperCase()
  if (normalized === 'NUEVO') return 'Nuevo'
  if (normalized === 'USADO') return 'Buen estado'
  if (normalized === 'MALOGRADO') return 'Con observaciones'
  return name || null
}

function NextcloudUnavailableNotice({ savedCode, reception = false }: { savedCode?: string; reception?: boolean }) {
  return <div className="nextcloud-unavailable" role="alert">
    <span aria-hidden="true">!</span>
    <div>
      <strong>Nextcloud no está disponible</strong>
      <p>{reception
        ? 'La recepción no fue cerrada ni se modificó el inventario. La firma sigue seleccionada; intenta nuevamente más tarde.'
        : savedCode
          ? `La solicitud ${savedCode} ya fue guardada y no se duplicará. Intenta cargar los archivos nuevamente más tarde.`
          : 'No se pudieron guardar los archivos. Permanecen seleccionados en esta ventana; intenta nuevamente más tarde.'}</p>
    </div>
  </div>
}

export function EquipmentRequestsPage({ role, notify }: { role: ViewRole; notify: (message: string, type?: 'success' | 'error') => void }) {
  const mine = role === 'almacenero'
  const [data, setData] = useState<Paginated<SolicitudEquipo> | null>(null)
  const [stateFilter, setStateFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<SolicitudEquipo | null>(null)
  const [attaching, setAttaching] = useState<SolicitudEquipo | null>(null)
  const [approvalPending, setApprovalPending] = useState<SolicitudEquipo | null>(null)
  const [approving, setApproving] = useState(false)
  const [rejectionPending, setRejectionPending] = useState<SolicitudEquipo | null>(null)
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
    <div className="requests-toolbar card"><div><span className={`role-chip ${mine ? 'mine' : 'lima'}`}>{mine ? 'Vista Mina' : 'Vista Lima'}</span><small>{mine ? 'Tus preingresos simulados' : 'Todas las solicitudes registradas'}</small></div><label><span>Estado</span><select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}><option value="">Todos</option><option value="ESPERA_APROBACION">Espera de aprobación</option><option value="EN_CAMINO">En camino</option><option value="RECIBIDO">Recibido</option><option value="RECHAZADO">No aprobado</option></select></label></div>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading && !data ? <Loader /> : <section className="card table-card">
      <div className="table-summary"><strong>{data?.total ?? 0}</strong> solicitudes encontradas</div>
      <div className="table-responsive"><table><thead><tr><th>Solicitud</th><th>Ruta</th><th>Equipos</th><th>Envío</th><th>Estado</th><th /></tr></thead><tbody>
        {data?.items.map((item) => <tr
          key={item.id}
          className="clickable-row"
          tabIndex={0}
          onClick={() => setSelected(item)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setSelected(item)
            }
          }}
        ><td><button className="item-title" onClick={(event) => { event.stopPropagation(); setSelected(item) }}>{item.codigo}</button><small className="item-subtitle">{item.solicitante_nombre}</small></td><td><strong>{item.ubicacion_origen.codigo}</strong><small className="item-subtitle">→ {item.ubicacion_destino.codigo}</small></td><td>{item.detalles.map((detail) => <div className="request-equipment" key={detail.id}><strong>{detail.nombre_equipo}</strong><small>{formatNumber(detail.cantidad)} {detail.unidad_medida.codigo}</small></div>)}</td><td>{formatDate(item.fecha_envio, true)}<small className="item-subtitle">{item.guia || 'Sin guía'}</small></td><td><span className={`request-status status-${item.estado.toLowerCase()}`}>{stateLabels[item.estado]}</span></td><td className="row-actions"><button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); setSelected(item) }}>Ver</button>{!mine && item.estado === 'ESPERA_APROBACION' && <><button className="btn btn-ghost btn-sm text-danger" onClick={(event) => { event.stopPropagation(); setRejectionPending(item) }}>No aprobar</button><button className="btn btn-secondary btn-sm" onClick={(event) => { event.stopPropagation(); setApprovalPending(item) }}>Aprobar</button></>}{!mine && item.estado === 'EN_CAMINO' && <button className="btn btn-primary btn-sm" onClick={(event) => { event.stopPropagation(); setReceiving(item) }}>Recibir e ingresar</button>}</td></tr>)}
      </tbody></table></div>
      {!data?.items.length && <EmptyState icon="⇢" title="No hay solicitudes" text={mine ? 'Registra el primer envío de equipos nuevos desde Mina.' : 'No existen solicitudes para el filtro seleccionado.'} />}
    </section>}
    {creating && <RequestForm onClose={() => { setCreating(false); void load() }} onSaved={async () => { setCreating(false); notify('Solicitud enviada a Logística Lima.'); await load() }} />}
    {selected && <RequestDetail
      item={selected}
      mine={mine}
      onClose={() => setSelected(null)}
      onApprove={() => setApprovalPending(selected)}
      onReject={() => setRejectionPending(selected)}
      onReceive={() => { setSelected(null); setReceiving(selected) }}
      onAttach={() => { setAttaching(selected); setSelected(null) }}
    />}
    {approvalPending && <ApprovalConfirmation item={approvalPending} saving={approving} onClose={() => !approving && setApprovalPending(null)} onConfirm={() => void approve()} />}
    {rejectionPending && <RejectionForm item={rejectionPending} onClose={() => setRejectionPending(null)} onSaved={async () => { setRejectionPending(null); setSelected(null); notify(`${rejectionPending.codigo} no fue aprobada.`); await load() }} />}
    {receiving && <ReceiveForm item={receiving} onClose={() => setReceiving(null)} onSaved={async () => { setReceiving(null); notify('Equipos incorporados al inventario correctamente.'); await load() }} />}
    {attaching && <AttachmentRetryForm item={attaching} onClose={() => setAttaching(null)} onSaved={async () => { setAttaching(null); notify(`Archivos adjuntados a ${attaching.codigo}.`); await load() }} />}
  </>
}

function RequestForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [initialDraft] = useState(readRequestDraft)
  const [options, setOptions] = useState<{ locations: Ubicacion[]; conditions: Catalogo[]; units: Unidad[] }>({ locations: [], conditions: [], units: [] })
  const [form, setForm] = useState<RequestHeaderDraft>(initialDraft?.form ?? { ubicacion_origen_id: '', ubicacion_destino_id: '', fecha_envio: localDateTime(), guia: '', transportista: '', observaciones_salida: '' })
  const [details, setDetails] = useState<RequestDetailDraft[]>(initialDraft?.details?.length ? initialDraft.details : [newDetail()])
  const [collapsedDetails, setCollapsedDetails] = useState<boolean[]>(initialDraft && initialDraft.collapsed?.length === initialDraft.details?.length ? initialDraft.collapsed : [false])
  const [documents, setDocuments] = useState<File[]>([])
  const [senderSignature, setSenderSignature] = useState<File | null>(null)
  const [createdRequest, setCreatedRequest] = useState<SolicitudEquipo | null>(null)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [nextcloudUnavailable, setNextcloudUnavailable] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(initialDraft ? new Date() : null)

  useEffect(() => {
    Promise.all([catalogsApi.locations(), catalogsApi.conditions(), catalogsApi.units()])
      .then(([locations, conditions, units]) => {
        setOptions({ locations, conditions, units })
        const unit = units.find((item) => item.codigo.toUpperCase() === 'UND') ?? units.find((item) => !item.permite_decimal)
        if (unit) setDetails((current) => current.map((item) => item.unidad_medida_id ? item : { ...item, unidad_medida_id: String(unit.id) }))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se cargaron las opciones.'))
  }, [])

  useEffect(() => {
    if (createdRequest) return
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({ form, details, collapsed: collapsedDetails }))
        setDraftSavedAt(new Date())
      } catch {
        // El formulario sigue operativo si el navegador bloquea el almacenamiento local.
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [form, details, collapsedDetails, createdRequest])

  const updateDetail = (index: number, key: keyof RequestDetailDraft, value: string) => {
    setDetails((current) => current.map((item, position) => position === index ? { ...item, [key]: value } : item))
  }
  const addDetail = () => {
    setDetails((current) => [...current, newDetail(current[0]?.unidad_medida_id)])
    setCollapsedDetails((current) => [...current, false])
  }
  const removeDetail = (index: number) => {
    setDetails((current) => current.filter((_, position) => position !== index))
    setCollapsedDetails((current) => current.filter((_, position) => position !== index))
  }
  const editDetail = (index: number) => setCollapsedDetails((current) => current.map((value, position) => position === index ? false : value))
  const detailError = (detail: RequestDetailDraft) => {
    if (!detail.nombre_equipo.trim()) return 'Indica el nombre o descripción del equipo.'
    if (!detail.cantidad || Number(detail.cantidad) < 1) return 'La cantidad debe ser mayor a cero.'
    if (!detail.unidad_medida_id) return 'Selecciona la unidad de medida.'
    if (!detail.condicion_salida_id) return 'Selecciona la condición de salida.'
    const selectedCondition = options.conditions.find((condition) => String(condition.id) === detail.condicion_salida_id)
    if (selectedCondition && /OBSERV|MALOGRADO/i.test(selectedCondition.nombre) && !detail.observaciones.trim()) return 'Describe las observaciones de la condición de salida.'
    if (!detail.calibracion_salida) return 'Selecciona el estado de calibración.'
    if (detail.calibracion_salida === 'CALIBRADO' && !detail.fecha_calibracion_salida) return 'Indica la fecha de calibración.'
    return ''
  }
  const saveDetail = (index: number) => {
    const validation = detailError(details[index])
    if (validation) { setError(`Equipo ${index + 1}: ${validation}`); return }
    setError('')
    setCollapsedDetails((current) => current.map((value, position) => position === index ? true : value))
  }
  const saveDraft = () => {
    try {
      localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({ form, details, collapsed: collapsedDetails }))
      setDraftSavedAt(new Date())
      setError('')
    } catch {
      setError('El navegador no permitió guardar el borrador local.')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNextcloudUnavailable(false)
    const invalidDetail = details.findIndex((detail) => detailError(detail))
    if (invalidDetail >= 0) {
      setCollapsedDetails((current) => current.map((value, index) => index === invalidDetail ? false : value))
      setError(`Equipo ${invalidDetail + 1}: ${detailError(details[invalidDetail])}`)
      setSaving(false)
      return
    }
    let persistedRequest = createdRequest
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
      persistedRequest = solicitud
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
      localStorage.removeItem(REQUEST_DRAFT_KEY)
      await onSaved()
    } catch (err) {
      if (isNextcloudUnavailable(err) && persistedRequest) setNextcloudUnavailable(true)
      else setError(err instanceof Error ? err.message : 'No se pudo registrar la solicitud.')
    }
    finally { setSaving(false); setProgress('') }
  }

  const findCondition = (...names: string[]) => options.conditions.find((condition) => names.some((name) => condition.nombre.trim().toUpperCase().includes(name)))
  const conditionChoices = [
    { label: 'Nuevo', condition: findCondition('NUEVO') },
    { label: 'Buen estado', condition: findCondition('BUEN', 'USADO') },
    { label: 'Con observaciones', condition: findCondition('OBSERV', 'MALOGRADO') },
  ]
  const origin = options.locations.find((location) => String(location.id) === form.ubicacion_origen_id)
  const destination = options.locations.find((location) => String(location.id) === form.ubicacion_destino_id)

  return <>{saving && <ProcessingOverlay title="Registrando solicitud" detail={progress || 'Procesando información…'} />}
  <Modal wide className="request-create-modal" eyebrow="Gestión de almacén" title="Nueva solicitud de envío" subtitle="Registra los equipos que salen de Mina para que Logística pueda recibirlos." onClose={onClose}>
    <form className="request-create-overhaul" onSubmit={submit}>
      <div className="request-create-main">
        {error && <ErrorNotice message={error} />}
        {nextcloudUnavailable && <NextcloudUnavailableNotice savedCode={createdRequest?.codigo} />}

        <section className="request-form-section">
          <div className="request-section-title"><div><h3>Datos del envío</h3><p>Define la ruta y los datos generales del despacho.</p></div></div>
          <div className="form-grid">
            <Field label="Origen" required><select value={form.ubicacion_origen_id} onChange={(e) => setForm({ ...form, ubicacion_origen_id: e.target.value })} required><option value="">Seleccionar</option>{options.locations.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.almacen.nombre}</option>)}</select></Field>
            <Field label="Destino previsto" required><select value={form.ubicacion_destino_id} onChange={(e) => setForm({ ...form, ubicacion_destino_id: e.target.value })} required><option value="">Seleccionar</option>{options.locations.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.almacen.nombre}</option>)}</select></Field>
            <Field label="Fecha y hora de envío" required><input type="datetime-local" value={form.fecha_envio} onChange={(e) => setForm({ ...form, fecha_envio: e.target.value })} required /></Field>
            <Field label="Guía o documento"><input value={form.guia} onChange={(e) => setForm({ ...form, guia: e.target.value })} /></Field>
            <Field label="Transportista"><input value={form.transportista} onChange={(e) => setForm({ ...form, transportista: e.target.value })} /></Field>
            <Field label="Observaciones generales"><textarea rows={2} value={form.observaciones_salida} onChange={(e) => setForm({ ...form, observaciones_salida: e.target.value })} /></Field>
          </div>
        </section>

        <section className="request-form-section">
          <div className="request-section-title"><div><h3>Equipos del envío</h3><p>Agrega cada tipo de equipo; si tiene serie, identifícalo individualmente.</p></div><button type="button" className="btn btn-secondary" onClick={addDetail}>＋ Agregar equipo</button></div>
          <div className="request-items">
            {details.map((detail, index) => collapsedDetails[index] ? <article className="saved-equipment-row" key={index}>
              <span>{index + 1}</span><div><strong>{detail.nombre_equipo}</strong><small>{detail.numero_serie ? `Serie ${detail.numero_serie}` : detail.codigo_patrimonial ? `Patrimonial ${detail.codigo_patrimonial}` : `${formatNumber(detail.cantidad)} ${options.units.find((unit) => String(unit.id) === detail.unidad_medida_id)?.codigo ?? ''}`}</small></div><b>{conditionChoices.find((choice) => String(choice.condition?.id) === detail.condicion_salida_id)?.label ?? 'Sin condición'}</b><button type="button" className="btn btn-ghost btn-sm" onClick={() => editDetail(index)}>Editar</button><button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => removeDetail(index)}>Quitar</button>
            </article> : <section className="request-item-card expanded" key={index}>
              <header><div><span>{index + 1}</span><strong>Equipo {index + 1}</strong></div>{details.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDetail(index)}>Quitar</button>}</header>
              <div className="form-grid">
                <Field label="Nombre o descripción" required className="span-2"><input value={detail.nombre_equipo} onChange={(e) => updateDetail(index, 'nombre_equipo', e.target.value)} placeholder="Ej. Detector multigás portátil" required /></Field>
                <Field label="Cantidad" required><input type="number" min="1" step="1" value={detail.cantidad} onChange={(e) => updateDetail(index, 'cantidad', e.target.value)} required /></Field>
                <Field label="Unidad" required><select value={detail.unidad_medida_id} onChange={(e) => updateDetail(index, 'unidad_medida_id', e.target.value)} required><option value="">Seleccionar</option>{options.units.filter((item) => !item.permite_decimal).map((item) => <option key={item.id} value={item.id}>{item.nombre} ({item.codigo})</option>)}</select></Field>
                <Field label="Marca"><input value={detail.marca} onChange={(e) => updateDetail(index, 'marca', e.target.value)} /></Field>
                <Field label="Modelo"><input value={detail.modelo} onChange={(e) => updateDetail(index, 'modelo', e.target.value)} /></Field>
                <Field label="Número de serie"><input value={detail.numero_serie} onChange={(e) => updateDetail(index, 'numero_serie', e.target.value)} /></Field>
                <Field label="Código patrimonial"><input value={detail.codigo_patrimonial} onChange={(e) => updateDetail(index, 'codigo_patrimonial', e.target.value)} /></Field>
                <div className="field span-3"><span>Condición de salida<b>*</b></span><div className="condition-buttons">{conditionChoices.map((choice) => <button type="button" key={choice.label} disabled={!choice.condition} className={String(choice.condition?.id) === detail.condicion_salida_id ? 'active' : ''} onClick={() => choice.condition && updateDetail(index, 'condicion_salida_id', String(choice.condition.id))}>{choice.label}</button>)}</div></div>
                <Field label="Calibración de salida" required><select value={detail.calibracion_salida} onChange={(e) => { updateDetail(index, 'calibracion_salida', e.target.value); if (e.target.value !== 'CALIBRADO') updateDetail(index, 'fecha_calibracion_salida', '') }} required><option value="">Seleccionar</option><option value="NO_CUMPLE">No aplica</option><option value="SIN_CALIBRAR">Sin calibrar</option><option value="CALIBRADO">Calibrado</option></select></Field>
                <Field label="Fecha de calibración" required={detail.calibracion_salida === 'CALIBRADO'}><input type="date" value={detail.fecha_calibracion_salida} onChange={(e) => updateDetail(index, 'fecha_calibracion_salida', e.target.value)} disabled={detail.calibracion_salida !== 'CALIBRADO'} required={detail.calibracion_salida === 'CALIBRADO'} /></Field>
                <Field label="Observaciones del equipo" className="span-3"><textarea rows={2} value={detail.observaciones} onChange={(e) => updateDetail(index, 'observaciones', e.target.value)} /></Field>
              </div>
              {Number(detail.cantidad) > 1 && (detail.numero_serie || detail.codigo_patrimonial) && <p className="field-hint">Si las unidades tienen series o códigos patrimoniales diferentes, agrégalas como líneas separadas.</p>}
              <div className="equipment-save-actions"><button type="button" className="btn btn-primary" onClick={() => saveDetail(index)}>Guardar equipo</button></div>
            </section>)}
          </div>
        </section>

        <section className="request-attachments request-form-section">
          <div className="request-section-title"><div><h3>Documentos y firma</h3><p>Los PDF y la firma se guardarán en el expediente privado.</p></div></div>
          <label className="file-drop"><span>Adjuntar documentos PDF</span><small>Hasta 10 archivos de 20 MB cada uno.</small><input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => setDocuments(Array.from(event.target.files ?? []).slice(0, 10))} /></label>
          {!!documents.length && <div className="selected-files">{documents.map((file, index) => <div key={`${file.name}-${index}`}><span>PDF</span><strong>{file.name}</strong><button type="button" onClick={() => setDocuments((current) => current.filter((_, position) => position !== index))}>×</button></div>)}</div>}
          <SignatureInput value={senderSignature} onChange={setSenderSignature} disabled={saving} />
          {createdRequest && <p className="field-hint">La solicitud {createdRequest.codigo} ya fue creada. Puedes continuar con los archivos pendientes sin duplicarla.</p>}
        </section>
      </div>

      <aside className="request-draft-summary">
        <h3>Resumen del envío</h3>
        <div><small>Origen</small><strong>{origin ? `${origin.codigo} · ${origin.almacen.nombre}` : 'Pendiente'}</strong></div>
        <div><small>Destino</small><strong>{destination ? `${destination.codigo} · ${destination.almacen.nombre}` : 'Pendiente'}</strong></div>
        <div><small>Fecha</small><strong>{form.fecha_envio ? formatDate(new Date(form.fecha_envio).toISOString(), true) : 'Pendiente'}</strong></div>
        <div><small>Equipos</small><strong>{details.length} · {details.reduce((sum, detail) => sum + (Number(detail.cantidad) || 0), 0)} unidades</strong></div>
        <p><span>i</span> El borrador se guarda automáticamente en este navegador. Los archivos y la firma deben seleccionarse nuevamente.</p>
        {draftSavedAt && <small className="draft-saved">Guardado a las {draftSavedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</small>}
      </aside>

      <footer className="request-create-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button><button type="button" className="btn btn-secondary" onClick={saveDraft}>Guardar borrador</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : createdRequest ? 'Reintentar carga de archivos' : 'Enviar solicitud'}</button></footer>
    </form>
  </Modal>
  </>
}

function RequestDetail({ item, mine, onClose, onApprove, onReject, onReceive, onAttach }: {
  item: SolicitudEquipo
  mine: boolean
  onClose: () => void
  onApprove: () => void
  onReject: () => void
  onReceive: () => void
  onAttach: () => void
}) {
  const [expandedEquipment, setExpandedEquipment] = useState<number | null>(null)
  const progress = item.estado === 'RECIBIDO' ? 3 : item.estado === 'EN_CAMINO' ? 2 : 1
  const fileName = (type: string, original: string) => type === 'DOCUMENTO' ? original : type === 'FIRMA_REMITENTE' ? 'Firma del remitente' : 'Firma del receptor'

  return <Modal wide className="request-review-modal" title={item.codigo} subtitle={`${item.ubicacion_origen.codigo} → ${item.ubicacion_destino.codigo}`} onClose={onClose}>
    <div className="request-review">
      <div className="request-progress" aria-label={`Estado: ${stateLabels[item.estado]}`}>
        {['Solicitud', 'En camino', 'Recibido'].map((label, index) => <div className={`request-progress-step ${progress >= index + 1 ? 'complete' : ''}`} key={label}>
          <span>{progress >= index + 1 ? '✓' : index + 1}</span><strong>{label}</strong>
        </div>)}
        <span className={`request-status status-${item.estado.toLowerCase()}`}>{stateLabels[item.estado]}</span>
      </div>

      <div className="request-review-layout">
        <div className="request-review-content">
          <section className="request-review-section">
            <h3>Resumen de {item.estado === 'RECIBIDO' ? 'recepción' : 'solicitud'}</h3>
            <div className="request-review-summary">
              <div><span aria-hidden="true"><PersonOutlineIcon /></span><p><small>Solicitante</small><strong>{item.solicitante_nombre}</strong></p></div>
              <div><span aria-hidden="true"><CalendarMonthOutlinedIcon /></span><p><small>Fecha de envío</small><strong>{formatDate(item.fecha_envio, true)}</strong></p></div>
              <div><span aria-hidden="true"><DescriptionOutlinedIcon /></span><p><small>Guía</small><strong>{item.guia || 'Sin guía'}</strong></p></div>
              <div><span aria-hidden="true"><EastIcon /></span><p><small>Origen</small><strong>{item.ubicacion_origen.codigo} · {item.ubicacion_origen.almacen.nombre}</strong></p></div>
              <div><span aria-hidden="true"><LocationOnOutlinedIcon /></span><p><small>Destino</small><strong>{item.ubicacion_destino.codigo} · {item.ubicacion_destino.almacen.nombre}</strong></p></div>
              <div><span aria-hidden="true"><LocalShippingOutlinedIcon /></span><p><small>Transportista</small><strong>{item.transportista || 'No indicado'}</strong></p></div>
            </div>
            <div className="request-general-notes"><small>Observaciones generales del envío</small><p>{item.observaciones_salida || 'Sin observaciones.'}</p></div>
          </section>

          {item.estado === 'RECHAZADO' && <section className="rejection-detail">
            <span aria-hidden="true">!</span>
            <div><strong>Motivo por el que no fue aprobada</strong><p>{item.motivo_rechazo}</p><small>{item.rechazado_por_nombre || 'Logística Lima'}{item.fecha_rechazo ? ` · ${formatDate(item.fecha_rechazo, true)}` : ''}</small></div>
          </section>}

          <section className="request-review-section">
            <h3>{item.estado === 'RECIBIDO' ? 'Equipos recibidos' : 'Equipos enviados'}</h3>
            <div className="request-equipment-cards">
              <div className="request-equipment-summary-head"><span>Equipo</span><span>Cantidad</span><span>Identificación</span><span>Condición</span><span /></div>
              {item.detalles.map((detail, index) => <article className="request-equipment-card" key={detail.id}>
                <button type="button" className="request-equipment-toggle" aria-expanded={expandedEquipment === detail.id} onClick={() => setExpandedEquipment((current) => current === detail.id ? null : detail.id)}>
                  <div><span>{index + 1}</span><strong>{detail.nombre_equipo}</strong></div>
                  <b>{formatNumber(detail.cantidad)} {detail.unidad_medida.codigo}</b>
                  <span>{detail.numero_serie ? `Serie ${detail.numero_serie}` : detail.codigo_patrimonial ? `Patrimonial ${detail.codigo_patrimonial}` : 'Sin identificación'}</span>
                  <span>{conditionDisplayName(detail.condicion_salida?.nombre) || 'Sin condición'} · {detail.calibracion_salida ? calibrationLabels[detail.calibracion_salida] : 'Sin calibración'}</span>
                  <KeyboardArrowDownIcon className={expandedEquipment === detail.id ? 'expanded' : ''} />
                </button>
                {expandedEquipment === detail.id && <div className="request-equipment-data">
                  <RequestData label="Marca" value={detail.marca} />
                  <RequestData label="Modelo" value={detail.modelo} />
                  <RequestData label="Número de serie" value={detail.numero_serie} />
                  <RequestData label="Código patrimonial" value={detail.codigo_patrimonial} />
                  <RequestData label="Condición de salida" value={conditionDisplayName(detail.condicion_salida?.nombre)} />
                  <RequestData label="Calibración de salida" value={detail.calibracion_salida ? calibrationLabels[detail.calibracion_salida] : null} />
                  <RequestData label="Fecha de calibración" value={detail.fecha_calibracion_salida ? formatDate(detail.fecha_calibracion_salida) : null} />
                  <RequestData label="Artículo de inventario" value={detail.inventario ? `${detail.inventario.codigo} · ${detail.inventario.descripcion}` : 'Preingreso sin vincular'} />
                  {item.estado === 'RECIBIDO' && <>
                    <RequestData label="Condición de recepción" value={conditionDisplayName(detail.condicion_recepcion?.nombre || detail.condicion_salida?.nombre)} />
                    <RequestData label="Calibración de recepción" value={detail.calibracion_recepcion ? calibrationLabels[detail.calibracion_recepcion] : detail.calibracion_salida ? calibrationLabels[detail.calibracion_salida] : null} />
                    <RequestData label="Fecha de calibración recibida" value={detail.fecha_calibracion_recepcion ? formatDate(detail.fecha_calibracion_recepcion) : detail.fecha_calibracion_salida ? formatDate(detail.fecha_calibracion_salida) : null} />
                  </>}
                  <RequestData label="Observaciones del equipo" value={detail.observaciones} wide />
                </div>}
              </article>)}
            </div>
          </section>

          <section className="request-review-section">
            <h3>Documentos y firmas</h3>
            {item.archivos.length ? <div className="request-document-grid">{item.archivos.map((file) => {
              const url = equipmentRequestsApi.fileUrl(item.id, file.id)
              return <article className="request-document-card" key={file.id}>
                <div className="request-document-preview">{file.tipo === 'DOCUMENTO' ? <span><PictureAsPdfOutlinedIcon /></span> : <img src={url} alt={fileName(file.tipo, file.nombre_original)} />}</div>
                <strong>{fileName(file.tipo, file.nombre_original)}</strong>
                <small>{formatDate(file.creado_en, true)}</small>
                <small>{(file.tamano_bytes / 1024).toFixed(1)} KB</small>
                <footer><a href={url} target="_blank" rel="noreferrer" aria-label={`Ver ${fileName(file.tipo, file.nombre_original)}`}><VisibilityOutlinedIcon /></a><a href={url} download={file.nombre_original} aria-label={`Descargar ${fileName(file.tipo, file.nombre_original)}`}><DownloadOutlinedIcon /></a></footer>
              </article>
            })}</div> : <p className="request-files-empty">No se adjuntaron documentos ni firmas.</p>}
          </section>
        </div>

        <aside className="request-review-history">
          <h3>Historial</h3>
          <div className="request-history">{[...item.historial].sort((a, b) => a.creado_en.localeCompare(b.creado_en)).map((entry) => <div key={entry.id}><span>✓</span><div><strong>{stateLabels[entry.estado_nuevo]}</strong><small>{entry.usuario_nombre}</small><small>{formatDate(entry.creado_en, true)}</small>{entry.comentario && <p>{entry.comentario}</p>}</div></div>)}</div>
        </aside>
      </div>

      <footer className="request-review-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        {mine && item.estado === 'ESPERA_APROBACION' && <button type="button" className="btn btn-secondary" onClick={onAttach}>Adjuntar archivos</button>}
        {!mine && item.estado === 'ESPERA_APROBACION' && <>
          <button type="button" className="btn btn-ghost text-danger" onClick={onReject}>No aprobar</button>
          <button type="button" className="btn btn-secondary" onClick={onApprove}>Aprobar y enviar</button>
        </>}
        {!mine && item.estado === 'EN_CAMINO' && <button type="button" className="btn btn-primary" onClick={onReceive}>Recibir e ingresar</button>}
      </footer>
    </div>
  </Modal>
}

function RequestData({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return <div className={`request-data ${wide ? 'wide' : ''}`}><small>{label}</small><strong>{value || 'No indicado'}</strong></div>
}

function AttachmentRetryForm({ item, onClose, onSaved }: {
  item: SolicitudEquipo
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const existingDocuments = item.archivos.filter((file) => file.tipo === 'DOCUMENTO').length
  const availableDocumentSlots = Math.max(0, 10 - existingDocuments)
  const hasSenderSignature = item.archivos.some((file) => file.tipo === 'FIRMA_REMITENTE')
  const [documents, setDocuments] = useState<File[]>([])
  const [senderSignature, setSenderSignature] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [nextcloudUnavailable, setNextcloudUnavailable] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNextcloudUnavailable(false)
    try {
      const pendingDocuments = [...documents]
      for (const [index, document] of pendingDocuments.entries()) {
        setProgress(`Subiendo PDF ${index + 1} de ${pendingDocuments.length}…`)
        await equipmentRequestsApi.uploadFile(item.id, 'DOCUMENTO', document, MINE_ACTOR)
        setDocuments((current) => current.filter((candidate) => candidate !== document))
      }
      if (!hasSenderSignature && senderSignature) {
        setProgress('Guardando la firma del remitente…')
        await equipmentRequestsApi.uploadFile(item.id, 'FIRMA_REMITENTE', senderSignature, MINE_ACTOR)
        setSenderSignature(null)
      }
      await onSaved()
    } catch (err) {
      if (isNextcloudUnavailable(err)) setNextcloudUnavailable(true)
      else setError(err instanceof Error ? err.message : 'No se pudieron adjuntar los archivos.')
    } finally {
      setSaving(false)
      setProgress('')
    }
  }

  const hasPendingFiles = documents.length > 0 || (!hasSenderSignature && senderSignature !== null)

  return <>{saving && <ProcessingOverlay title="Adjuntando archivos" detail={progress || 'Guardando archivos en Nextcloud…'} />}
    <Modal title={`Adjuntar archivos a ${item.codigo}`} subtitle="Completa los documentos pendientes antes de que Lima apruebe el envío." onClose={onClose}>
      {error && <ErrorNotice message={error} />}
      {nextcloudUnavailable && <NextcloudUnavailableNotice />}
      <form className="request-create-form" onSubmit={submit}>
        {availableDocumentSlots > 0 ? <label className="file-drop">
          <span>Adjuntar documentos PDF</span>
          <small>Puedes agregar {availableDocumentSlots} archivo{availableDocumentSlots === 1 ? '' : 's'} más.</small>
          <input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => setDocuments(Array.from(event.target.files ?? []).slice(0, availableDocumentSlots))} />
        </label> : <p className="request-files-empty">La solicitud ya tiene el máximo de 10 documentos PDF.</p>}
        {!!documents.length && <div className="selected-files">{documents.map((file, index) => <div key={`${file.name}-${index}`}><span>PDF</span><strong>{file.name}</strong><button type="button" onClick={() => setDocuments((current) => current.filter((_, position) => position !== index))}>×</button></div>)}</div>}
        {hasSenderSignature
          ? <p className="signature-ready">✓ La firma del remitente ya está almacenada.</p>
          : <SignatureInput value={senderSignature} onChange={setSenderSignature} disabled={saving} />}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !hasPendingFiles}>{nextcloudUnavailable ? 'Reintentar' : 'Guardar archivos'}</button>
        </div>
      </form>
    </Modal>
  </>
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

function RejectionForm({ item, onClose, onSaved }: {
  item: SolicitudEquipo
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const normalizedReason = reason.trim().replace(/\s+/g, ' ')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (normalizedReason.length < 5) {
      setError('Escribe un motivo de al menos 5 caracteres.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await equipmentRequestsApi.reject(item.id, {
        usuario_nombre: LIMA_ACTOR,
        motivo: normalizedReason,
      })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la decisión.')
    } finally {
      setSaving(false)
    }
  }

  return <>{saving && <ProcessingOverlay title="Registrando decisión" detail="Guardando el motivo en el historial de la solicitud…" />}
    <Modal compact title={`No aprobar ${item.codigo}`} subtitle="Indica a Mina qué debe revisar o corregir." onClose={onClose}>
      <form className="rejection-form" onSubmit={submit}>
        {error && <ErrorNotice message={error} />}
        <Field label="Motivo" required>
          <textarea
            rows={5}
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ejemplo: falta adjuntar la guía firmada o completar el número de serie."
            autoFocus
            required
          />
        </Field>
        <div className="rejection-form-help">
          <span aria-hidden="true">i</span>
          <p>La solicitud quedará como <strong>No aprobada</strong>. El motivo será visible para Mina y se conservará en el historial.</p>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-danger" disabled={saving || normalizedReason.length < 5}>Confirmar</button>
        </div>
      </form>
    </Modal>
  </>
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
  const [nextcloudUnavailable, setNextcloudUnavailable] = useState(false)

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
    event.preventDefault(); setSaving(true); setError(''); setNextcloudUnavailable(false)
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
    } catch (err) {
      if (isNextcloudUnavailable(err)) setNextcloudUnavailable(true)
      else setError(err instanceof Error ? err.message : 'No se pudo registrar la recepción.')
    }
    finally { setSaving(false); setProgress('') }
  }

  return <>{saving && <ProcessingOverlay title="Procesando recepción" detail={progress || 'Procesando información…'} />}
  <Modal wide title={`Recibir ${item.codigo}`} subtitle="Confirma los datos y crea o vincula cada equipo en el inventario de Lima." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    {nextcloudUnavailable && <NextcloudUnavailableNotice reception />}
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
            <Field label="Calibración de recepción"><select value={entry.calibracion} onChange={(e) => {
              const calibration = e.target.value
              update(detail.id, {
                calibracion: calibration,
                fecha_calibracion: calibration === ''
                  ? detail.fecha_calibracion_salida ?? ''
                  : calibration === 'CALIBRADO'
                    ? entry.fecha_calibracion || detail.fecha_calibracion_salida || ''
                    : '',
              })
            }}><option value="">Conservar dato de salida</option><option value="NO_CUMPLE">No aplica</option><option value="SIN_CALIBRAR">Sin calibrar</option><option value="CALIBRADO">Calibrado</option></select></Field>
            <Field label="Fecha de calibración" required={entry.calibracion === 'CALIBRADO'}><input type="date" value={entry.fecha_calibracion} onChange={(e) => update(detail.id, { fecha_calibracion: e.target.value })} disabled={entry.calibracion !== 'CALIBRADO'} required={entry.calibracion === 'CALIBRADO'} /></Field>
          </div>
        </section>
      })}
      <Field label="Observaciones de recepción"><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <section className="request-attachments">
        <div className="request-items-heading"><div><strong>Conformidad del receptor</strong><small>Firma en la pantalla o adjunta un PNG existente.</small></div></div>
        {signatureUploaded ? <p className="signature-ready">✓ La firma del receptor ya está almacenada.</p> : <>
          <SignatureInput value={receiverSignature} onChange={setReceiverSignature} disabled={saving} />
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

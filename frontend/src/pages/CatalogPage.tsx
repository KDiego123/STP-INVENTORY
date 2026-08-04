import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { catalogsApi } from '../api'
import { EmptyState, ErrorNotice, Loader, Modal } from '../components'
import type { Almacen, Catalogo, Clasificacion, Grupo, Ubicacion, Unidad } from '../types'

export type CatalogType =
  | 'grupos'
  | 'familias'
  | 'subfamilias'
  | 'clasificaciones'
  | 'unidades'
  | 'almacenes'
  | 'ubicaciones'
  | 'condiciones'

type Item = Catalogo | Grupo | Clasificacion | Unidad | Almacen | Ubicacion

const labels: Record<CatalogType, { title: string; singular: string; text: string }> = {
  grupos: { title: 'Grupos', singular: 'grupo', text: 'Define los grupos principales y sus prefijos de codificación.' },
  familias: { title: 'Familias', singular: 'familia', text: 'Administra las familias del glosario corporativo.' },
  subfamilias: { title: 'Subfamilias', singular: 'subfamilia', text: 'Administra el nivel de clasificación más específico.' },
  clasificaciones: { title: 'Clasificaciones', singular: 'clasificación', text: 'Relaciona combinaciones válidas de grupo, familia y subfamilia.' },
  unidades: { title: 'Unidades de medida', singular: 'unidad', text: 'Define cómo se contabilizan las existencias.' },
  almacenes: { title: 'Almacenes', singular: 'almacén', text: 'Registra Lima, minas y otros almacenes físicos.' },
  ubicaciones: { title: 'Ubicaciones', singular: 'ubicación', text: 'Administra zonas y espacios dentro de cada almacén.' },
  condiciones: { title: 'Condiciones', singular: 'condición', text: 'Clasifica el estado físico de los artículos.' },
}

function isClassification(item: Item): item is Clasificacion {
  return 'grupo' in item && 'familia' in item && 'subfamilia' in item
}

function itemText(item: Item) {
  if (isClassification(item)) return `${item.grupo.nombre} ${item.familia.nombre} ${item.subfamilia.nombre}`
  const code = 'codigo' in item ? item.codigo : 'prefijo' in item ? item.prefijo : ''
  const name = 'nombre' in item ? item.nombre : ''
  return `${name} ${code}`
}

function itemTitle(item: Item) {
  if (isClassification(item)) return `${item.grupo.nombre} › ${item.familia.nombre} › ${item.subfamilia.nombre}`
  if ('prefijo' in item && item.prefijo === 'EPP') return 'Equipo de Protección Personal'
  if ('codigo' in item) return item.codigo
  return item.nombre
}

function itemSubtitle(item: Item) {
  if (isClassification(item)) return 'Combinación de clasificación'
  if ('prefijo' in item) return `Prefijo ${item.prefijo}`
  if ('codigo' in item && 'nombre' in item) return item.nombre
  if ('almacen' in item) return item.almacen.nombre
  return item.descripcion || 'Sin descripción'
}

export function CatalogPage({ type, notify, embedded = false }: {
  type: CatalogType
  notify: (message: string, kind?: 'success' | 'error') => void
  embedded?: boolean
}) {
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Almacen[]>([])
  const [groups, setGroups] = useState<Grupo[]>([])
  const [families, setFamilies] = useState<Catalogo[]>([])
  const [subfamilies, setSubfamilies] = useState<Catalogo[]>([])
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const info = labels[type]

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const loaders: Record<CatalogType, () => Promise<Item[]>> = {
        grupos: () => catalogsApi.groups(true),
        familias: () => catalogsApi.families(true),
        subfamilias: () => catalogsApi.subfamilies(true),
        clasificaciones: () => catalogsApi.classifications(true),
        unidades: () => catalogsApi.units(true),
        almacenes: () => catalogsApi.warehouses(true),
        ubicaciones: () => catalogsApi.locations(true),
        condiciones: () => catalogsApi.conditions(true),
      }
      const [result, warehouseOptions, groupOptions, familyOptions, subfamilyOptions] = await Promise.all([
        loaders[type](),
        type === 'ubicaciones' ? catalogsApi.warehouses() : Promise.resolve([]),
        type === 'clasificaciones' ? catalogsApi.groups() : Promise.resolve([]),
        type === 'clasificaciones' ? catalogsApi.families() : Promise.resolve([]),
        type === 'clasificaciones' ? catalogsApi.subfamilies() : Promise.resolve([]),
      ])
      setItems(result)
      setWarehouses(warehouseOptions)
      setGroups(groupOptions)
      setFamilies(familyOptions)
      setSubfamilies(subfamilyOptions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => { void load() }, [load])
  const filtered = items.filter((item) => itemText(item).toLowerCase().includes(query.toLowerCase()))

  const toggle = async (item: Item) => {
    if (!window.confirm(`¿Deseas ${item.activo ? 'desactivar' : 'activar'} este registro?`)) return
    try {
      await catalogsApi.toggle(type, item.id)
      notify(`Se ${item.activo ? 'desactivó' : 'activó'} correctamente.`)
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo cambiar el estado.', 'error')
    }
  }

  return <>
    <div className={`page-heading ${embedded ? 'catalog-embedded-heading' : ''}`}>
      <div>{!embedded && <p className="eyebrow">Configuración</p>}<h1>{info.title}</h1><p>{info.text}</p></div>
      <button className="btn btn-primary" onClick={() => setEditing('new')}>＋ Nuevo registro</button>
    </div>
    <div className="filter-bar compact"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${info.title.toLowerCase()}`} /></label></div>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading ? <Loader /> : <section className="card catalog-grid">
      {filtered.map((item) => <article className={`catalog-card ${!item.activo ? 'inactive' : ''}`} key={item.id}>
        <div className="catalog-icon">◇</div>
        <div className="catalog-copy"><div><strong>{itemTitle(item)}</strong></div><p>{itemSubtitle(item)}</p></div>
        <span className={`badge ${item.activo ? 'badge-success' : 'badge-neutral'}`}>{item.activo ? 'Activo' : 'Inactivo'}</span>
        <div className="catalog-actions"><button className="btn btn-ghost btn-sm" onClick={() => setEditing(item)}>Editar</button><button className="btn btn-ghost btn-sm" onClick={() => void toggle(item)}>{item.activo ? 'Desactivar' : 'Activar'}</button></div>
      </article>)}
      {!filtered.length && <EmptyState title="No encontramos resultados" text="Cambia la búsqueda o agrega un registro nuevo." />}
    </section>}
    {editing && <CatalogForm
      type={type}
      item={editing === 'new' ? null : editing}
      warehouses={warehouses}
      groups={groups}
      families={families}
      subfamilies={subfamilies}
      onClose={() => setEditing(null)}
      onSaved={async () => { setEditing(null); notify('Registro guardado correctamente.'); await load() }}
    />}
  </>
}

function CatalogForm({ type, item, warehouses, groups, families, subfamilies, onClose, onSaved }: {
  type: CatalogType
  item: Item | null
  warehouses: Almacen[]
  groups: Grupo[]
  families: Catalogo[]
  subfamilies: Catalogo[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const classification = item && isClassification(item) ? item : null
  const [form, setForm] = useState({
    nombre: item && 'nombre' in item ? item.nombre : '',
    codigo: item && 'codigo' in item ? item.codigo : '',
    prefijo: item && 'prefijo' in item ? item.prefijo : '',
    descripcion: item && 'descripcion' in item ? item.descripcion ?? '' : '',
    activo: item?.activo ?? true,
    permite_decimal: item && 'permite_decimal' in item ? item.permite_decimal : false,
    almacen_id: item && 'almacen' in item ? String(item.almacen.id) : warehouses[0] ? String(warehouses[0].id) : '',
    grupo_id: classification ? String(classification.grupo_id) : groups[0] ? String(groups[0].id) : '',
    familia_id: classification ? String(classification.familia_id) : families[0] ? String(families[0].id) : '',
    subfamilia_id: classification ? String(classification.subfamilia_id) : subfamilies[0] ? String(subfamilies[0].id) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    let payload: Record<string, unknown> = { nombre: form.nombre, descripcion: form.descripcion.trim() || null, activo: form.activo }
    if (type === 'grupos') payload = { ...payload, prefijo: form.prefijo }
    if (type === 'unidades') payload = { ...payload, codigo: form.codigo, permite_decimal: form.permite_decimal }
    if (type === 'ubicaciones') payload = { codigo: form.codigo, descripcion: form.descripcion.trim() || null, activo: form.activo, almacen_id: Number(form.almacen_id) }
    if (type === 'clasificaciones') payload = { grupo_id: Number(form.grupo_id), familia_id: Number(form.familia_id), subfamilia_id: Number(form.subfamilia_id), activo: form.activo }
    try {
      await catalogsApi.save(type, payload, item?.id)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return <Modal title={`${item ? 'Editar' : 'Nuevo'} ${labels[type].singular}`} subtitle="Los cambios estarán disponibles de inmediato en los formularios." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    <form className="form-grid one-column" onSubmit={submit}>
      {type === 'clasificaciones' ? <>
        <Field label="Grupo" required><select value={form.grupo_id} onChange={(event) => setForm({ ...form, grupo_id: event.target.value })} required><option value="">Seleccionar</option>{groups.map((value) => <option value={value.id} key={value.id}>{value.nombre}</option>)}</select></Field>
        <Field label="Familia" required><select value={form.familia_id} onChange={(event) => setForm({ ...form, familia_id: event.target.value })} required><option value="">Seleccionar</option>{families.map((value) => <option value={value.id} key={value.id}>{value.nombre}</option>)}</select></Field>
        <Field label="Subfamilia" required><select value={form.subfamilia_id} onChange={(event) => setForm({ ...form, subfamilia_id: event.target.value })} required><option value="">Seleccionar</option>{subfamilies.map((value) => <option value={value.id} key={value.id}>{value.nombre}</option>)}</select></Field>
      </> : <>
        {type !== 'ubicaciones' && type !== 'unidades' && <Field label="Nombre" required><input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required /></Field>}
        {(type === 'unidades' || type === 'ubicaciones') && <Field label="Código" required><input value={form.codigo} onChange={(event) => setForm({ ...form, codigo: event.target.value })} required /></Field>}
        {type === 'grupos' && <Field label="Prefijo de código" required><input value={form.prefijo} onChange={(event) => setForm({ ...form, prefijo: event.target.value.toUpperCase() })} required /></Field>}
        {type === 'unidades' && <Field label="Nombre" required><input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required /></Field>}
        {type === 'ubicaciones' && <Field label="Almacén" required><select value={form.almacen_id} onChange={(event) => setForm({ ...form, almacen_id: event.target.value })} required><option value="">Seleccionar</option>{warehouses.map((value) => <option value={value.id} key={value.id}>{value.nombre}</option>)}</select></Field>}
        <Field label="Descripción"><textarea rows={3} value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></Field>
        {type === 'unidades' && <label className="check-field"><input type="checkbox" checked={form.permite_decimal} onChange={(event) => setForm({ ...form, permite_decimal: event.target.checked })} /><span>Permite cantidades decimales</span></label>}
      </>}
      <label className="check-field"><input type="checkbox" checked={form.activo} onChange={(event) => setForm({ ...form, activo: event.target.checked })} /><span>Registro activo</span></label>
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  </Modal>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="field"><span>{label}{required && <b>*</b>}</span>{children}</label>
}

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { catalogsApi } from '../api'
import { EmptyState, ErrorNotice, Loader, Modal } from '../components'
import type { Almacen, Catalogo, Ubicacion, Unidad } from '../types'

type CatalogType = 'categorias' | 'unidades' | 'ubicaciones' | 'condiciones'
type Item = Catalogo | Unidad | Ubicacion

const labels: Record<CatalogType, { title: string; singular: string; text: string }> = {
  categorias: { title: 'Categorías', singular: 'categoría', text: 'Organiza los artículos por familias fáciles de identificar.' },
  unidades: { title: 'Unidades de medida', singular: 'unidad', text: 'Define cómo se contabilizan las existencias.' },
  ubicaciones: { title: 'Ubicaciones', singular: 'ubicación', text: 'Administra estantes, zonas y espacios del almacén.' },
  condiciones: { title: 'Condiciones', singular: 'condición', text: 'Clasifica el estado físico de los artículos.' },
}

export function CatalogPage({ type, notify }: { type: CatalogType; notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Almacen[]>([])
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const info = labels[type]
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const loader = type === 'categorias' ? catalogsApi.categories(true) : type === 'unidades' ? catalogsApi.units(true) : type === 'ubicaciones' ? catalogsApi.locations(true) : catalogsApi.conditions(true)
      const [result, almacenes] = await Promise.all([loader, type === 'ubicaciones' ? catalogsApi.warehouses() : Promise.resolve([])])
      setItems(result); setWarehouses(almacenes)
    } catch (err) { setError(err instanceof Error ? err.message : 'Error inesperado') }
    finally { setLoading(false) }
  }, [type])
  useEffect(() => { void load() }, [load])
  const filtered = items.filter((item) => {
    const code = 'codigo' in item ? item.codigo : ''
    const name = 'nombre' in item ? item.nombre : ''
    return `${name} ${code}`.toLowerCase().includes(query.toLowerCase())
  })
  const toggle = async (item: Item) => {
    if (!window.confirm(`¿Deseas ${item.activo ? 'desactivar' : 'activar'} este registro?`)) return
    try { await catalogsApi.toggle(type, item.id); notify(`Se ${item.activo ? 'desactivó' : 'activó'} correctamente.`); await load() }
    catch (err) { notify(err instanceof Error ? err.message : 'No se pudo cambiar el estado.', 'error') }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">Configuración</p><h1>{info.title}</h1><p>{info.text}</p></div><button className="btn btn-primary" onClick={() => setEditing('new')}>＋ Nueva {info.singular}</button></div>
    <div className="filter-bar compact"><label className="search-field"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Buscar ${info.title.toLowerCase()}`} /></label></div>
    {error ? <ErrorNotice message={error} onRetry={load} /> : loading ? <Loader /> : <section className="card catalog-grid">
      {filtered.map((item) => <article className={`catalog-card ${!item.activo ? 'inactive' : ''}`} key={item.id}>
        <div className="catalog-icon">{type === 'categorias' ? '◇' : type === 'unidades' ? '⌁' : type === 'ubicaciones' ? '⌖' : '✓'}</div>
        <div className="catalog-copy"><div><strong>{'codigo' in item ? item.codigo : item.nombre}</strong>{'codigo' in item && 'nombre' in item && <span>{item.nombre}</span>}</div><p>{item.descripcion || ('almacen' in item ? item.almacen.nombre : 'Sin descripción')}</p></div>
        <span className={`badge ${item.activo ? 'badge-success' : 'badge-neutral'}`}>{item.activo ? 'Activo' : 'Inactivo'}</span>
        <div className="catalog-actions"><button className="btn btn-ghost btn-sm" onClick={() => setEditing(item)}>Editar</button><button className="btn btn-ghost btn-sm" onClick={() => void toggle(item)}>{item.activo ? 'Desactivar' : 'Activar'}</button></div>
      </article>)}
      {!filtered.length && <EmptyState title="No encontramos resultados" text="Cambia la búsqueda o agrega un término nuevo." />}
    </section>}
    {editing && <CatalogForm type={type} item={editing === 'new' ? null : editing} warehouses={warehouses} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); notify(`${info.singular[0].toUpperCase()}${info.singular.slice(1)} guardada correctamente.`); await load() }} />}
  </>
}

function CatalogForm({ type, item, warehouses, onClose, onSaved }: { type: CatalogType; item: Item | null; warehouses: Almacen[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    nombre: item && 'nombre' in item ? item.nombre : '', codigo: item && 'codigo' in item ? item.codigo : '', descripcion: item?.descripcion ?? '', activo: item?.activo ?? true,
    permite_decimal: item && 'permite_decimal' in item ? item.permite_decimal : false, almacen_id: item && 'almacen' in item ? String(item.almacen.id) : warehouses[0] ? String(warehouses[0].id) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    let payload: Record<string, unknown> = { nombre: form.nombre, descripcion: form.descripcion.trim() || null, activo: form.activo }
    if (type === 'unidades') payload = { ...payload, codigo: form.codigo, permite_decimal: form.permite_decimal }
    if (type === 'ubicaciones') payload = { codigo: form.codigo, descripcion: form.descripcion.trim() || null, activo: form.activo, almacen_id: Number(form.almacen_id) }
    try { await catalogsApi.save(type, payload, item?.id); await onSaved() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.') }
    finally { setSaving(false) }
  }
  return <Modal title={`${item ? 'Editar' : 'Nueva'} ${labels[type].singular}`} subtitle="Los cambios estarán disponibles de inmediato en los formularios." onClose={onClose}>
    {error && <ErrorNotice message={error} />}
    <form className="form-grid one-column" onSubmit={submit}>
      {type !== 'ubicaciones' && type !== 'unidades' && <Field label="Nombre" required><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></Field>}
      {(type === 'unidades' || type === 'ubicaciones') && <Field label="Código" required><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required /></Field>}
      {type === 'unidades' && <Field label="Nombre" required><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></Field>}
      {type === 'ubicaciones' && <Field label="Almacén" required><select value={form.almacen_id} onChange={(e) => setForm({ ...form, almacen_id: e.target.value })} required>{warehouses.map((x) => <option value={x.id} key={x.id}>{x.nombre}</option>)}</select></Field>}
      <Field label="Descripción"><textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field>
      {type === 'unidades' && <label className="check-field"><input type="checkbox" checked={form.permite_decimal} onChange={(e) => setForm({ ...form, permite_decimal: e.target.checked })} /><span>Permite cantidades decimales</span></label>}
      <label className="check-field"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /><span>Registro activo</span></label>
      <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
    </form>
  </Modal>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{required && <b>*</b>}</span>{children}</label>
}

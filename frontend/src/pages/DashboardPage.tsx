import { useCallback, useEffect, useState } from 'react'
import { dashboardApi } from '../api'
import { EmptyState, ErrorNotice, formatDate, formatNumber, Loader } from '../components'
import type { PageKey } from '../App'
import type { Dashboard } from '../types'

export function DashboardPage({ navigate }: { navigate: (page: PageKey) => void }) {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setError('')
    try { setData(await dashboardApi()) } catch (err) { setError(err instanceof Error ? err.message : 'Error inesperado') }
  }, [])
  useEffect(() => { void load() }, [load])

  if (error) return <ErrorNotice message={error} onRetry={load} />
  if (!data) return <Loader />

  return <>
    <div className="page-heading"><div><p className="eyebrow">Resumen general</p><h1>Panel de inventario</h1><p>Estado actual del almacén de Lima.</p></div><button className="btn btn-primary" onClick={() => navigate('movimientos')}>＋ Registrar movimiento</button></div>
    <section className="stats-grid">
      <button className="stat-card" onClick={() => navigate('inventario')}><span className="stat-icon blue">▦</span><div><small>Artículos activos</small><strong>{data.articulos_activos}</strong></div><b>→</b></button>
      <button className="stat-card" onClick={() => navigate('categorias')}><span className="stat-icon teal">◇</span><div><small>Categorías</small><strong>{data.categorias_activas}</strong></div><b>→</b></button>
      <button className="stat-card" onClick={() => navigate('ubicaciones')}><span className="stat-icon amber">⌖</span><div><small>Ubicaciones</small><strong>{data.ubicaciones_activas}</strong></div><b>→</b></button>
      <button className={`stat-card ${data.stock_bajo ? 'danger' : ''}`} onClick={() => navigate('inventario')}><span className="stat-icon red">!</span><div><small>Alertas de stock</small><strong>{data.stock_bajo}</strong></div><b>→</b></button>
    </section>
    <div className="dashboard-grid">
      <section className="card">
        <div className="card-header"><div><h2>Movimientos recientes</h2><p>Últimas operaciones registradas</p></div><button className="text-button" onClick={() => navigate('movimientos')}>Ver todos</button></div>
        {data.movimientos_recientes.length ? <div className="activity-list">{data.movimientos_recientes.map((item) => <div className="activity-item" key={item.id}>
          <span className={`movement-dot sign-${item.tipo_movimiento.signo_stock ?? 0}`} />
          <div><strong>{item.tipo_movimiento.nombre} · {item.inventario.codigo}</strong><small>{item.inventario.descripcion}</small></div>
          <div className="activity-meta"><strong>{formatNumber(item.cantidad)} {item.inventario.unidad_medida.codigo}</strong><small>{formatDate(item.fecha, true)}</small></div>
        </div>)}</div> : <EmptyState icon="⇄" title="Sin movimientos" text="Todavía no se han registrado operaciones." />}
      </section>
      <section className="card">
        <div className="card-header"><div><h2>Alertas de stock</h2><p>Artículos en el mínimo o por debajo</p></div></div>
        {data.alertas_stock.length ? <div className="stock-list">{data.alertas_stock.map((item) => <div className="stock-item" key={item.id}><div><strong>{item.codigo}</strong><small>{item.descripcion}</small></div><span>{formatNumber(item.stock_actual)} / {formatNumber(item.stock_minimo)} {item.unidad_medida.codigo}</span></div>)}</div> : <EmptyState icon="✓" title="Todo en orden" text="No hay alertas de stock pendientes." />}
      </section>
    </div>
  </>
}

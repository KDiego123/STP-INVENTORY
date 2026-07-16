import { useEffect, useState } from 'react'
import { CatalogPage } from './pages/CatalogPage'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { MovementsPage } from './pages/MovementsPage'
import { Toast } from './components'

export type PageKey = 'inicio' | 'inventario' | 'movimientos' | 'categorias' | 'unidades' | 'ubicaciones' | 'condiciones'

const navItems: Array<{ key: PageKey; label: string; icon: string; group?: string }> = [
  { key: 'inicio', label: 'Inicio', icon: '⌂' },
  { key: 'inventario', label: 'Inventario', icon: '▦' },
  { key: 'movimientos', label: 'Movimientos', icon: '⇄' },
  { key: 'categorias', label: 'Categorías', icon: '◇', group: 'Configuración' },
  { key: 'unidades', label: 'Unidades', icon: '⌁' },
  { key: 'ubicaciones', label: 'Ubicaciones', icon: '⌖' },
  { key: 'condiciones', label: 'Condiciones', icon: '✓' },
]

function readPage(): PageKey {
  const value = window.location.hash.replace('#/', '') as PageKey
  return navItems.some((item) => item.key === value) ? value : 'inicio'
}

export default function App() {
  const [page, setPage] = useState<PageKey>(readPage)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const onHash = () => setPage(readPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (key: PageKey) => {
    window.location.hash = `/${key}`
    setPage(key)
    setSidebarOpen(false)
  }

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 5000)
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark">IL</span><div><strong>Inventario Lima</strong><small>Gestión de almacén</small></div></div>
      <nav>
        {navItems.map((item, index) => <div key={item.key}>
          {item.group && <p className="nav-group">{item.group}</p>}
          <button className={`nav-link ${page === item.key ? 'active' : ''}`} onClick={() => navigate(item.key)}>
            <span>{item.icon}</span>{item.label}
          </button>
          {index === 2 && <div className="nav-separator" />}
        </div>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot" /><div><strong>Acceso local</strong><small>Autenticación desactivada</small></div></div>
    </aside>
    {sidebarOpen && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}

    <div className="content-shell">
      <header className="topbar">
        <button className="menu-button" onClick={() => setSidebarOpen(true)}>☰</button>
        <span>Sociedad Tecnológica del Perú S.A.C.</span>
        <time>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date())}</time>
      </header>
      <main>
        {page === 'inicio' && <DashboardPage navigate={navigate} />}
        {page === 'inventario' && <InventoryPage notify={notify} />}
        {page === 'movimientos' && <MovementsPage notify={notify} />}
        {(['categorias', 'unidades', 'ubicaciones', 'condiciones'] as PageKey[]).includes(page) &&
          <CatalogPage type={page as 'categorias' | 'unidades' | 'ubicaciones' | 'condiciones'} notify={notify} />}
      </main>
    </div>
    {toast && <Toast {...toast} onClose={() => setToast(null)} />}
  </div>
}

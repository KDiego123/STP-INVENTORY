import { type ReactNode, useEffect, useState } from 'react'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import PreviewOutlinedIcon from '@mui/icons-material/PreviewOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { MovementsPage } from './pages/MovementsPage'
import { EquipmentRequestsPage } from './pages/EquipmentRequestsPage'
import { ViewPreviewPage } from './pages/ViewPreviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { Toast } from './components'

export type PageKey = 'vista' | 'inicio' | 'inventario' | 'solicitudes' | 'movimientos' | 'configuracion'
export type ViewRole = 'logistica' | 'almacenero'

const navItems: Array<{ key: PageKey; label: string; icon: ReactNode; group?: string; roles?: ViewRole[] }> = [
  { key: 'vista', label: 'Vista de prueba', icon: <PreviewOutlinedIcon /> },
  { key: 'inicio', label: 'Inicio', icon: <HomeOutlinedIcon /> },
  { key: 'inventario', label: 'Inventario', icon: <Inventory2OutlinedIcon /> },
  { key: 'solicitudes', label: 'Solicitudes de equipos', icon: <LocalShippingOutlinedIcon /> },
  { key: 'movimientos', label: 'Movimientos', icon: <SwapHorizIcon />, roles: ['logistica'] },
  { key: 'configuracion', label: 'Configuración', icon: <SettingsOutlinedIcon />, group: 'Administración', roles: ['logistica'] },
]

function readPage(): PageKey {
  const value = window.location.hash.replace('#/', '') as PageKey
  return navItems.some((item) => item.key === value) ? value : 'inicio'
}

export default function App() {
  const [page, setPage] = useState<PageKey>(readPage)
  const [viewRole, setViewRole] = useState<ViewRole>(() => sessionStorage.getItem('inventory-view-role') === 'almacenero' ? 'almacenero' : 'logistica')
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

  const changeViewRole = (role: ViewRole) => {
    sessionStorage.setItem('inventory-view-role', role)
    setViewRole(role)
    const target = navItems.find((item) => item.key === page)
    if (target?.roles && !target.roles.includes(role)) navigate('vista')
  }

  const visibleNavItems = navItems.filter((item) => !item.roles || item.roles.includes(viewRole))

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 5000)
  }

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark">IL</span><div><strong>Inventario Lima</strong><small>Gestión de almacén</small></div></div>
      <nav>
        {visibleNavItems.map((item, index) => <div key={item.key}>
          {item.group && <p className="nav-group">{item.group}</p>}
          <button className={`nav-link ${page === item.key ? 'active' : ''}`} onClick={() => navigate(item.key)}>
            <span>{item.icon}</span>{item.label}
          </button>
          {item.key === 'movimientos' && <div className="nav-separator" />}
        </div>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot" /><div><strong>Acceso local</strong><small>Autenticación desactivada</small></div></div>
    </aside>
    {sidebarOpen && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}

    <div className="content-shell">
      <header className="topbar">
        <button className="menu-button" onClick={() => setSidebarOpen(true)}>☰</button>
        <span>Sociedad Tecnológica del Perú S.A.C.</span>
        <div className="topbar-actions"><label className="view-switcher"><span>Vista de prueba</span><select value={viewRole} onChange={(e) => changeViewRole(e.target.value as ViewRole)}><option value="logistica">Logística · Lima</option><option value="almacenero">Almacenero · Mina</option></select></label><time>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date())}</time></div>
      </header>
      <main>
        {page === 'vista' && <ViewPreviewPage role={viewRole} onRoleChange={changeViewRole} navigate={navigate} />}
        {page === 'inicio' && (viewRole === 'logistica' ? <DashboardPage navigate={navigate} /> : <ViewPreviewPage role={viewRole} onRoleChange={changeViewRole} navigate={navigate} />)}
        {page === 'inventario' && <InventoryPage notify={notify} readOnly={viewRole === 'almacenero'} />}
        {page === 'solicitudes' && <EquipmentRequestsPage role={viewRole} notify={notify} />}
        {page === 'movimientos' && viewRole === 'logistica' && <MovementsPage notify={notify} />}
        {page === 'configuracion' && viewRole === 'logistica' && <SettingsPage notify={notify} />}
      </main>
    </div>
    {toast && <Toast {...toast} onClose={() => setToast(null)} />}
  </div>
}

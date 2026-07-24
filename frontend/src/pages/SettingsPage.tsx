import { type ReactNode, useState } from 'react'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined'
import { CatalogPage } from './CatalogPage'

type CatalogType = 'categorias' | 'unidades' | 'ubicaciones' | 'condiciones'

const sections: Array<{ key: CatalogType; label: string; description: string; icon: ReactNode }> = [
  { key: 'categorias', label: 'Categorías', description: 'Familias de artículos', icon: <CategoryOutlinedIcon /> },
  { key: 'unidades', label: 'Unidades', description: 'Formas de contabilización', icon: <StraightenOutlinedIcon /> },
  { key: 'ubicaciones', label: 'Ubicaciones', description: 'Espacios de almacén', icon: <LocationOnOutlinedIcon /> },
  { key: 'condiciones', label: 'Condiciones', description: 'Estados físicos', icon: <FactCheckOutlinedIcon /> },
]

export function SettingsPage({ notify }: { notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [section, setSection] = useState<CatalogType>('categorias')

  return <>
    <div className="page-heading settings-heading">
      <div><p className="eyebrow">Administración</p><h1>Configuración</h1><p>Gestiona los datos base que se utilizan en inventario, movimientos y solicitudes.</p></div>
    </div>
    <section className="card settings-shell">
      <nav className="settings-navigation" aria-label="Secciones de configuración">
        {sections.map((item) => <button
          type="button"
          key={item.key}
          className={section === item.key ? 'active' : ''}
          onClick={() => setSection(item.key)}
          aria-current={section === item.key ? 'page' : undefined}
        >
          <span className="settings-navigation-icon">{item.icon}</span>
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>)}
      </nav>
      <div className="settings-content">
        <CatalogPage type={section} notify={notify} embedded />
      </div>
    </section>
  </>
}

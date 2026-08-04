import { type ReactNode, useState } from 'react'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import HubOutlinedIcon from '@mui/icons-material/HubOutlined'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined'
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined'
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined'
import { CatalogPage, type CatalogType } from './CatalogPage'

const sections: Array<{ key: CatalogType; label: string; description: string; icon: ReactNode }> = [
  { key: 'grupos', label: 'Grupos', description: 'Nivel principal y prefijos', icon: <HubOutlinedIcon /> },
  { key: 'familias', label: 'Familias', description: 'Familias del glosario', icon: <CategoryOutlinedIcon /> },
  { key: 'subfamilias', label: 'Subfamilias', description: 'Clasificación específica', icon: <AccountTreeOutlinedIcon /> },
  { key: 'clasificaciones', label: 'Clasificaciones', description: 'Combinaciones válidas', icon: <SchemaOutlinedIcon /> },
  { key: 'unidades', label: 'Unidades', description: 'Formas de contabilización', icon: <StraightenOutlinedIcon /> },
  { key: 'almacenes', label: 'Almacenes', description: 'Centros físicos', icon: <WarehouseOutlinedIcon /> },
  { key: 'ubicaciones', label: 'Ubicaciones', description: 'Espacios de almacén', icon: <LocationOnOutlinedIcon /> },
  { key: 'condiciones', label: 'Condiciones', description: 'Estados físicos', icon: <FactCheckOutlinedIcon /> },
]

export function SettingsPage({ notify }: { notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [section, setSection] = useState<CatalogType>('grupos')

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

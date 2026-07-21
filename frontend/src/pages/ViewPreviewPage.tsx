import type { PageKey, ViewRole } from '../App'

export function ViewPreviewPage({ role, onRoleChange, navigate }: { role: ViewRole; onRoleChange: (role: ViewRole) => void; navigate: (page: PageKey) => void }) {
  const logistics = role === 'logistica'
  return <>
    <div className="page-heading"><div><p className="eyebrow">Simulación sin autenticación</p><h1>Vista de {logistics ? 'Logística · Lima' : 'Almacenero · Mina'}</h1><p>Esta selección solo simula la navegación y los permisos visibles de cada perfil.</p></div></div>
    <section className="role-preview card">
      <div className="role-tabs" role="tablist" aria-label="Vista simulada">
        <button className={logistics ? 'active' : ''} onClick={() => onRoleChange('logistica')}>Logística · Lima</button>
        <button className={!logistics ? 'active' : ''} onClick={() => onRoleChange('almacenero')}>Almacenero · Mina</button>
      </div>
      <div className="role-preview-content">
        <span className="role-preview-icon">{logistics ? 'L' : 'M'}</span>
        <div><p className="eyebrow">Perfil activo en esta pestaña</p><h2>{logistics ? 'Control administrativo completo' : 'Consulta operativa restringida'}</h2><p>{logistics ? 'Puede administrar inventario, movimientos y catálogos. Próximamente también aprobará y recibirá envíos de equipos.' : 'Puede consultar el inventario sin editarlo. Próximamente podrá crear y revisar únicamente sus solicitudes de envío.'}</p></div>
      </div>
      <div className="role-capabilities">
        {(logistics ? ['Administrar inventario', 'Registrar movimientos', 'Configurar catálogos', 'Aprobar y recibir equipos (próximamente)'] : ['Consultar inventario', 'Crear solicitudes propias (próximamente)', 'Adjuntar constancias (próximamente)', 'Seguir sus envíos (próximamente)']).map((item) => <div key={item}><span>✓</span>{item}</div>)}
      </div>
      <div className="role-preview-actions"><button className="btn btn-primary" onClick={() => navigate('inventario')}>Abrir inventario {logistics ? 'administrable' : 'en solo lectura'}</button></div>
    </section>
  </>
}

# Inventario Lima · React + FastAPI

Aplicación administrativa para gestionar el inventario almacenado en PostgreSQL.

## Arquitectura

- `frontend`: React 19 + TypeScript + Vite.
- `backend`: FastAPI + SQLAlchemy + PostgreSQL.
- `frontend/dist`: versión compilada que FastAPI sirve directamente.
- No se modifica ni recrea el esquema existente de PostgreSQL.

La aplicación permite:

- Visualizar indicadores y alertas de stock.
- Buscar y filtrar inventario.
- Crear, editar, activar y desactivar artículos.
- Registrar entradas, salidas, ajustes y traslados.
- Anular el último movimiento de un artículo y revertir su efecto.
- Crear y editar categorías, unidades, ubicaciones y condiciones.
- Registrar preingresos de uno o varios equipos enviados desde Mina.
- Aprobar, seguir y recibir envíos, creando o vinculando sus artículos en inventario.
- Conservar marca, modelo, serie, código patrimonial, condición y calibración.

## Migraciones

Las migraciones se ejecutan manualmente en `inventario_db`, en orden, antes de
iniciar una versión nueva del backend. No recrean el esquema ni eliminan datos.

Para el flujo de preingreso de equipos se requiere:

```text
importacion-excel/002_calibracion_equipos.sql
importacion-excel/003_fecha_calibracion.sql
importacion-excel/004_solicitudes_equipos.sql
importacion-excel/005_preingreso_equipos.sql
```

La migración `005` desvincula el preingreso del inventario existente, restringe
las cantidades a enteros y añade los datos de identificación de equipos.

## Importante sobre seguridad

La autenticación está desactivada por solicitud para esta primera fase. El script
de inicio escucha únicamente en `127.0.0.1`, por lo que la aplicación solo se
puede abrir dentro del servidor remoto.

No cambie el host a `0.0.0.0`, no abra el puerto 8000 en el firewall y no publique
esta versión en Internet. Antes de habilitar acceso desde otros equipos se debe
incorporar autenticación, permisos y HTTPS.

## Instalación en Windows Server

Copiar la carpeta completa al servidor. No es necesario copiar `node_modules` ni
un entorno `.venv`; ambos son archivos generados para cada equipo.

Desde PowerShell, dentro de esta carpeta:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\instalar.ps1
```

El instalador utiliza por defecto el Python aislado ubicado en:

```text
%LOCALAPPDATA%\Programs\Python\Python313\python.exe
```

Después, editar `backend\.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventario_db
DB_USER=inventario_importador
DB_PASSWORD=CONTRASENA_REAL
DB_SSLMODE=prefer

API_HOST=127.0.0.1
API_PORT=8000
FRONTEND_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
AUTH_ENABLED=false
```

No colocar comillas alrededor de los valores. No compartir ni publicar `.env`.

## Iniciar

```powershell
.\iniciar.ps1
```

Abrir dentro del servidor:

```text
http://127.0.0.1:8000
```

La documentación técnica de la API está disponible localmente en:

```text
http://127.0.0.1:8000/docs
```

## Verificación rápida

Con el servicio iniciado, en otra ventana PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Debe devolver `status: ok`, `database: inventario_db` y
`auth_enabled: false`.

## Desarrollo del frontend

Solo se requiere Node.js para modificar y volver a compilar React. Vite 8 necesita
Node 20.19+ o 22.12+.

```powershell
Set-Location .\frontend
npm install
npm run dev
```

Después de modificarlo:

```powershell
npm run build
```

El resultado se guarda en `frontend\dist` y será servido automáticamente por
FastAPI en el siguiente inicio.

## Autenticación futura

`AUTH_ENABLED=false` es solo una reserva de configuración; actualmente no activa
ni desactiva rutas porque no existen pantallas de login o registro. La siguiente
fase puede incorporar usuarios y roles sin conectar React directamente a
PostgreSQL ni cambiar la separación entre frontend y API.

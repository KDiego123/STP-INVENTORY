# Importacion de Inventario LIMA

## 1. Preparar Python

Desde PowerShell, en este directorio:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## 2. Validar el Excel

Este comando no se conecta a PostgreSQL ni modifica datos:

```powershell
python .\importar_inventario.py --validar
```

La importacion solo se habilita cuando todas las filas son validas.

## 3. Configurar la conexion

Crear `.env` a partir de `.env.example`:

```powershell
Copy-Item .\.env.example .\.env
```

Editar `.env` y colocar el host, usuario y contrasena reales. Para la primera
carga se puede usar temporalmente el usuario administrador `postgres`. La cuenta
indicada debe tener permisos sobre `inventario_db`. No compartir ni subir `.env`
a Git. La aplicacion web usara posteriormente un usuario propio con menos
privilegios.

Si el script se ejecuta directamente dentro del servidor de PostgreSQL, usar
`DB_HOST=localhost`. Antes de importar se debe ejecutar
`001_esquema_inicial.sql` sobre `inventario_db`.

## 4. Importar

Importar inventario y catalogos, sin fabricar historial de movimientos:

```powershell
python .\importar_inventario.py --importar
```

Para registrar ademas un ajuste inicial por cada fila, con fecha tomada de D2:

```powershell
python .\importar_inventario.py --importar --registrar-stock-inicial
```

La segunda opcion deja trazabilidad del stock inicial. Si se repite, actualiza
el movimiento inicial existente en lugar de duplicarlo.

## Reglas de transformacion

- Cada fila conserva su identidad y recibe un codigo `LIMA-0001`, `LIMA-0002`, etc.
- Las descripciones repetidas no se fusionan.
- Categoria, unidad y ubicacion se normalizan a mayusculas.
- Los catalogos que no existan se crean automaticamente.
- `NUEVO`, `USADO` y `MALOGRADO` se guardan como condicion.
- `-` se transforma en observacion vacia.
- Los demas textos de la columna Observaciones se conservan como notas.
- La importacion completa se confirma o revierte como una sola transaccion.
- Si se repite un codigo, el registro de inventario se actualiza y no se duplica.

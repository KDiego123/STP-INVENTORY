# Migracion del inventario maestro STP

## Preparar el inventario maestro

Para fusionar `BD PRODUCTOS STP (1).xlsx` con `Inventario LIMA.xlsx` sin
modificar los archivos originales:

```powershell
python .\fusionar_inventarios.py
```

El resultado se guarda como `INVENTARIO_MAESTRO_STP.xlsx`. Para regenerarlo:

```powershell
python .\fusionar_inventarios.py --sobrescribir
```

Todos los articulos del maestro se consideran habilitados para la carga. No se
usa `ESTADO REVISION` ni se exige aprobacion individual. Las incidencias de
`CONTROL CALIDAD BD` son informativas y se completaran posteriormente.

El maestro conserva un codigo STP unico por articulo. Cuando varias filas de
Lima representan el mismo articulo, unidad y ubicacion, suma su stock en una
sola fila. `CONTROL MIGRACION LIMA` conserva las 251 filas originales como
trazabilidad de la fusion.

La fusion no incorpora precios ni valorizacion.

## Paso 1: crear un backup completo

El respaldo de `inventario_db` debe incluir esquema y datos. No basta el archivo
de solo esquema. Mantener el backup fuera del repositorio.

## Paso 2: preparar Python

Desde PowerShell, dentro de `importacion-excel`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Paso 3: validar tecnicamente el maestro

Este comando no se conecta a PostgreSQL:

```powershell
python .\importar_inventario_maestro.py --validar
```

Los avisos de glosario no bloquean la carga. Solo se detiene por errores que
PostgreSQL no puede almacenar, como codigos repetidos, relaciones obligatorias
vacias o cantidades invalidas.

## Paso 4: detener la aplicacion y reiniciar la base

Con la aplicacion detenida, abrir en pgAdmin el Query Tool de `inventario_db` y
ejecutar completo:

```text
009_reinicio_inventario_maestro.sql
```

Este SQL elimina los datos operativos de prueba, unidades, condiciones,
ubicaciones y almacenes. Conserva tipos de movimiento, usuarios compartidos,
roles, FDW, `auth_shared` y configuracion externa de Nextcloud.

La limpieza y el cambio de estructura se ejecutan en una sola transaccion. Si
una sentencia falla, PostgreSQL revierte toda la operacion.

No ejecute la migracion 009 con una version antigua de la aplicacion en marcha.
Debe desplegarse junto con el backend y frontend compatibles.

## Paso 5: configurar la conexion

Crear `importacion-excel\.env` con la conexion real. Si el cargador se ejecuta
en el propio servidor de PostgreSQL, usar `DB_HOST=localhost`.

```text
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventario_db
DB_USER=postgres
DB_PASSWORD=CAMBIAR
```

No compartir ni subir `.env` a Git.

## Paso 6: importar el maestro

```powershell
python .\importar_inventario_maestro.py --importar
```

El cargador exige que inventario, movimientos, solicitudes, unidades y
ubicaciones esten vacios. Si encuentra datos, cancela la operacion para impedir
una mezcla. Toda la carga se confirma o revierte como una sola transaccion.

## Paso 7: verificar

```sql
SELECT count(*) AS articulos FROM public.inventario;
SELECT count(*) AS unidades FROM public.unidades_medida;
SELECT count(*) AS grupos FROM public.grupos;
SELECT count(*) AS ubicaciones FROM public.ubicaciones;
```

El maestro actual contiene 3416 articulos, 16 unidades, 8 grupos, un almacen y
16 ubicaciones conocidas de Lima. Los productos sin ubicacion se guardan con
`ubicacion_id = NULL`.

## Reglas de carga

- Los codigos STP son unicos.
- Las 16 unidades se reconstruyen exclusivamente desde la hoja `U M`.
- Familias y subfamilias usadas por articulos se cargan incluso si aparecen en
  `CONTROL CALIDAD BD`.
- Los valores vacios de ubicacion se guardan como `NULL`; no se crean
  ubicaciones ficticias.
- `NO APLICA` se almacena internamente como `NO_CUMPLE`; el frontend lo muestra
  como `No aplica`.
- La importacion completa se confirma o revierte como una sola transaccion.

La limpieza de metadatos de solicitudes no elimina automaticamente los archivos
de prueba guardados en Nextcloud. Esos archivos se retiran por separado.

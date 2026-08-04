from copy import copy
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING, Iterable

import openpyxl
from openpyxl.drawing.image import Image
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils.units import pixels_to_EMU

if TYPE_CHECKING:
    from .models import Inventario


TEMPLATE_PATH = Path(__file__).resolve().parents[2] / "importacion-excel" / "Inventario LIMA.xlsx"
LOGO_PATH = Path(__file__).resolve().parents[2] / "importacion-excel" / "STP.png"
FIRST_DATA_ROW = 7


def _safe_excel_text(value: str | None, default: str = "") -> str:
    text = (value or "").strip()
    if not text:
        return default
    if text[0] in ("=", "+", "-", "@"):
        return f"'{text}"
    return text


def generar_inventario_excel(
    items: Iterable["Inventario"],
    fecha_inventario: date | None = None,
    template_path: Path = TEMPLATE_PATH,
    logo_path: Path = LOGO_PATH,
) -> BytesIO:
    if not template_path.exists():
        raise FileNotFoundError(f"No se encontró la plantilla de inventario: {template_path}")
    if not logo_path.exists():
        raise FileNotFoundError(f"No se encontró el logo institucional: {logo_path}")

    workbook = openpyxl.load_workbook(template_path)
    worksheet = workbook["INVENTARIO"]
    if "MOVIMIENTOS" in workbook.sheetnames:
        del workbook["MOVIMIENTOS"]

    worksheet._images = []
    logo = Image(logo_path)
    logo_width = 270
    logo_height = round(logo_width * logo.height / logo.width)
    logo.width = logo_width
    logo.height = logo_height
    logo.anchor = OneCellAnchor(
        _from=AnchorMarker(
            col=0,
            colOff=pixels_to_EMU(26),
            row=0,
            rowOff=pixels_to_EMU(22),
        ),
        ext=XDRPositiveSize2D(
            cx=pixels_to_EMU(logo_width),
            cy=pixels_to_EMU(logo_height),
        ),
    )
    worksheet.add_image(logo)

    styles = [copy(worksheet.cell(FIRST_DATA_ROW, column)._style) for column in range(1, 12)]
    alignments = [copy(worksheet.cell(FIRST_DATA_ROW, column).alignment) for column in range(1, 12)]
    row_height = worksheet.row_dimensions[FIRST_DATA_ROW].height
    if worksheet.max_row >= FIRST_DATA_ROW:
        worksheet.delete_rows(FIRST_DATA_ROW, worksheet.max_row - FIRST_DATA_ROW + 1)

    inventory_date = fecha_inventario or date.today()
    worksheet["C2"] = "Fecha de inventario:"
    worksheet["D2"] = inventory_date
    worksheet["D2"].number_format = "dd/mm/yyyy"
    worksheet["C6"] = "Grupo"
    worksheet["I6"] = "Marca"
    worksheet["J6"] = "Modelo"

    rows = list(items)
    for index, item in enumerate(rows, start=1):
        row = FIRST_DATA_ROW + index - 1
        values = (
            index,
            _safe_excel_text(item.descripcion),
            _safe_excel_text(item.clasificacion.grupo.nombre),
            _safe_excel_text(item.unidad_medida.codigo),
            item.stock_actual,
            _safe_excel_text(item.ubicacion.codigo if item.ubicacion else None),
            item.fecha_ultima_entrada,
            item.fecha_ultima_salida,
            _safe_excel_text(item.marca),
            _safe_excel_text(item.modelo),
            _safe_excel_text(item.observaciones, "-"),
        )
        for column, value in enumerate(values, start=1):
            cell = worksheet.cell(row, column, value)
            cell._style = copy(styles[column - 1])
            cell.alignment = copy(alignments[column - 1])
        worksheet.cell(row, 7).number_format = "dd/mm/yyyy"
        worksheet.cell(row, 8).number_format = "dd/mm/yyyy"
        worksheet.row_dimensions[row].height = row_height

    last_row = max(FIRST_DATA_ROW, FIRST_DATA_ROW + len(rows) - 1)
    worksheet.auto_filter.ref = f"A6:K{last_row}"
    worksheet.print_area = f"A1:K{last_row}"
    worksheet.freeze_panes = "A7"
    worksheet.sheet_view.showGridLines = False
    worksheet.page_setup.orientation = "landscape"
    worksheet.page_setup.fitToWidth = 1
    worksheet.page_setup.fitToHeight = 0
    worksheet.sheet_properties.pageSetUpPr.fitToPage = True
    worksheet.oddFooter.center.text = "Página &P de &N"

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output

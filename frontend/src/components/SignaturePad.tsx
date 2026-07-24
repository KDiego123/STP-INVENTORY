import { useRef, useState } from 'react'

function SignaturePad({ onChange, disabled = false, expanded = false }: {
  onChange: (file: File | null) => void
  disabled?: boolean
  expanded?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasSignature, setHasSignature] = useState(false)

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const canvas = event.currentTarget
    const context = canvas.getContext('2d')
    if (!context) return
    const current = point(event)
    drawing.current = true
    canvas.setPointerCapture(event.pointerId)
    context.beginPath()
    context.moveTo(current.x, current.y)
  }

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    const current = point(event)
    context.lineTo(current.x, current.y)
    context.strokeStyle = '#173c53'
    context.lineWidth = 4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
    setHasSignature(true)
  }

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    event.currentTarget.toBlob((blob) => {
      if (blob) onChange(new File([blob], `firma-${Date.now()}.png`, { type: 'image/png' }))
    }, 'image/png')
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onChange(null)
  }

  return <div className={`signature-pad ${expanded ? 'signature-pad-expanded' : ''}`}>
    <div className="signature-pad-heading">
      <div><strong>Firmar aquí</strong><small>Usa el mouse, lápiz o dedo.</small></div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={!hasSignature || disabled}>Limpiar</button>
    </div>
    <canvas
      ref={canvasRef}
      width={1200}
      height={800}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      aria-label="Área para dibujar la firma"
    />
    <span className="signature-line">Firma</span>
  </div>
}

export function SignatureInput({ value, onChange, disabled = false }: {
  value: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}) {
  const [signing, setSigning] = useState(false)
  const [draft, setDraft] = useState<File | null>(null)

  const openSigning = () => {
    setDraft(null)
    setSigning(true)
  }

  const closeSigning = () => {
    setDraft(null)
    setSigning(false)
  }

  const useSignature = () => {
    if (!draft) return
    onChange(draft)
    setSigning(false)
    setDraft(null)
  }

  return <>
    <div className="signature-methods">
      <button type="button" className="signature-method" onClick={openSigning} disabled={disabled}>
        <span className="signature-method-icon" aria-hidden="true">✎</span>
        <span><strong>Firmar aquí</strong><small>Abre un espacio amplio para firmar con mouse, lápiz o dedo.</small></span>
        <b>→</b>
      </button>
      <label className={`signature-method ${disabled ? 'disabled' : ''}`}>
        <span className="signature-method-icon upload" aria-hidden="true">↑</span>
        <span><strong>Subir Firma PNG</strong><small>Selecciona una firma guardada de máximo 5 MB.</small></span>
        <b>＋</b>
        <input
          type="file"
          accept="image/png,.png"
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.files?.[0] ?? null)
            event.currentTarget.value = ''
          }}
        />
      </label>
    </div>
    {value && <div className="signature-selection">
      <span aria-hidden="true">✓</span>
      <div><strong>Firma preparada</strong><small>{value.name}</small></div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)} disabled={disabled}>Quitar</button>
    </div>}
    {signing && <div className="signature-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Firmar aquí">
      <section className="signature-dialog">
        <header>
          <div><p className="eyebrow">Firma electrónica</p><h2>Firmar aquí</h2><p>Firma dentro del recuadro usando el mouse, lápiz o dedo.</p></div>
          <button type="button" className="icon-button" onClick={closeSigning} aria-label="Cerrar">×</button>
        </header>
        <div className="signature-dialog-body">
          <SignaturePad onChange={setDraft} expanded />
          <p className="signature-dialog-hint">Procura que la firma quede centrada y no toque los bordes.</p>
        </div>
        <footer>
          <button type="button" className="btn btn-ghost" onClick={closeSigning}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={useSignature} disabled={!draft}>Usar esta firma</button>
        </footer>
      </section>
    </div>}
  </>
}

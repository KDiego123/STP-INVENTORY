import { useRef, useState } from 'react'

export function SignaturePad({ onChange, disabled = false }: {
  onChange: (file: File | null) => void
  disabled?: boolean
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

  return <div className="signature-pad">
    <div className="signature-pad-heading">
      <div><strong>Firmar aquí</strong><small>Usa el mouse, lápiz o dedo.</small></div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={!hasSignature || disabled}>Limpiar</button>
    </div>
    <canvas
      ref={canvasRef}
      width={1000}
      height={320}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      aria-label="Área para dibujar la firma"
    />
    <span className="signature-line">Firma</span>
  </div>
}

import { QRCodeSVG } from 'qrcode.react'
import { useEffect } from 'react'

function QRLabel({ item, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="qr-label-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby="qr-label-title"
        aria-modal="true"
        className="qr-label-dialog"
        role="dialog"
      >
        <div className="qr-label-screen-actions">
          <p>Print-ready asset label</p>
          <div>
            <button className="button button--quiet" onClick={onClose} type="button">Close</button>
            <button className="button button--primary" onClick={() => window.print()} type="button">Print Label</button>
          </div>
        </div>

        <article className="qr-label-print">
          <div className="qr-label-code">
            <QRCodeSVG
              aria-label={`QR code for ${item.name}`}
              bgColor="#ffffff"
              fgColor="#142f27"
              level="M"
              size={176}
              value={item.payload}
            />
          </div>
          <div className="qr-label-details">
            <span className="qr-label-brand">PARTSPAL · ROBOTICS LAB</span>
            <h1 id="qr-label-title">{item.name}</h1>
            <p className="qr-label-identifier">{item.identifier}</p>
            <p className="qr-label-instruction">Scan to identify this {item.kind}.</p>
          </div>
        </article>
      </section>
    </div>
  )
}

export default QRLabel

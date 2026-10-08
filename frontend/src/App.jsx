import { useEffect, useMemo, useState } from 'react'
import { createPart, getParts } from './services/api'

const initialForm = { name: '', category: '', total_quantity: '' }

async function fetchParts() {
  const result = await getParts()
  if (!Array.isArray(result?.parts)) {
    throw new Error('The server returned an invalid inventory response.')
  }
  return result.parts
}

function Icon({ name, size = 20 }) {
  const paths = {
    boxes: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5M12 13v8" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14m-7-7h14" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  )
}

function SummaryCards({ parts }) {
  const totals = parts.reduce(
    (summary, part) => ({
      total: summary.total + Number(part.total_quantity || 0),
      available: summary.available + Number(part.available_quantity || 0),
      lowStock: summary.lowStock + (Number(part.available_quantity) <= 2 ? 1 : 0),
    }),
    { total: 0, available: 0, lowStock: 0 },
  )

  const cards = [
    { label: 'Total Part Types', value: parts.length, note: 'unique components', tone: 'mint' },
    { label: 'Total Items', value: totals.total, note: 'across your inventory', tone: 'lavender' },
    { label: 'Available Items', value: totals.available, note: 'ready for the next build', tone: 'blue' },
    { label: 'Low Stock Items', value: totals.lowStock, note: 'parts to keep an eye on', tone: 'peach' },
  ]

  return (
    <section className="summary-grid" aria-label="Inventory summary">
      {cards.map((card, index) => (
        <article className={`summary-card summary-card--${card.tone}`} key={card.label}>
          <div className="summary-card__top">
            <span>{card.label}</span>
            <span className="summary-card__index">0{index + 1}</span>
          </div>
          <strong>{card.value}</strong>
          <p>{card.note}</p>
        </article>
      ))}
    </section>
  )
}

function PartStatus({ quantity }) {
  if (quantity === 0) return <span className="status status--out">Out of Stock</span>
  if (quantity <= 2) return <span className="status status--low">Low Stock</span>
  return <span className="status status--in">In Stock</span>
}

function InventoryTable({ parts }) {
  if (parts.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__icon"><Icon name="boxes" size={25} /></span>
        <h3>No parts found</h3>
        <p>Try another search or category, or add a part to your inventory.</p>
      </div>
    )
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Part</th>
            <th scope="col">Category</th>
            <th scope="col">Total</th>
            <th scope="col">Available</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.id ?? `${part.name}-${part.category}`}>
              <td>
                <div className="part-name">
                  <span className="part-name__icon"><Icon name="boxes" size={17} /></span>
                  <span>{part.name}</span>
                </div>
              </td>
              <td><span className="category-label">{part.category}</span></td>
              <td className="quantity-cell">{part.total_quantity}</td>
              <td className="quantity-cell">{part.available_quantity}</td>
              <td><PartStatus quantity={Number(part.available_quantity)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AddPartForm({ onClose, onCreate }) {
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const quantity = Number(form.total_quantity)

    if (!form.name.trim()) {
      setError('Enter a part name.')
      return
    }
    if (!form.category.trim()) {
      setError('Enter a category.')
      return
    }
    if (form.total_quantity === '' || !Number.isInteger(quantity) || quantity < 0) {
      setError('Quantity must be a non-negative whole number.')
      return
    }

    setError('')
    setSaving(true)
    try {
      await onCreate({
        name: form.name.trim(),
        category: form.category.trim(),
        total_quantity: quantity,
      })
      setForm(initialForm)
    } catch {
      setError('Could not add this part. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose()
    }}>
      <section
        aria-labelledby="add-part-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <div className="modal__heading">
          <div>
            <span className="eyebrow">INVENTORY</span>
            <h2 id="add-part-title">Add a part</h2>
            <p>Keep your lab inventory up to date.</p>
          </div>
          <button aria-label="Close form" className="icon-button" disabled={saving} onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>
        <form className="add-form" onSubmit={handleSubmit}>
          <label>
            Part Name
            <input autoFocus maxLength={100} name="name" onChange={updateField} placeholder="e.g. Arduino Uno" required value={form.name} />
          </label>
          <label>
            Category
            <input maxLength={100} name="category" onChange={updateField} placeholder="e.g. Microcontrollers" required value={form.category} />
          </label>
          <label>
            Total Quantity
            <input min="0" name="total_quantity" onChange={updateField} placeholder="0" required step="1" type="number" value={form.total_quantity} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal__actions">
            <button className="button button--quiet" disabled={saving} onClick={onClose} type="button">Cancel</button>
            <button className="button button--primary" disabled={saving} type="submit">
              {saving ? 'Adding…' : 'Add part'}
              {!saving && <Icon name="arrow" size={17} />}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function App() {
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  async function loadParts() {
    setLoading(true)
    setLoadError(false)
    try {
      setParts(await fetchParts())
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetchParts()
      .then((loadedParts) => {
        if (active) setParts(loadedParts)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const categories = useMemo(
    () => [...new Set(parts.map((part) => part.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [parts],
  )
  const filteredParts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return parts.filter((part) => {
      const matchesSearch = !query
        || part.name?.toLocaleLowerCase().includes(query)
        || part.category?.toLocaleLowerCase().includes(query)
      return matchesSearch && (category === 'all' || part.category === category)
    })
  }, [parts, search, category])

  async function handleCreate(part) {
    await createPart(part)
    setIsFormOpen(false)
    setSuccessMessage(`${part.name} added to your inventory.`)
    await loadParts()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a aria-label="PartsPal home" className="brand" href="/">
          <span className="brand__mark"><Icon name="boxes" size={22} /></span>
          <span>Parts<span className="brand__accent">Pal</span></span>
        </a>
        <div className="topbar__right">
          <span className="connection-indicator"><span /> Lab inventory</span>
          <span className="avatar" aria-label="Robotics lab">RL</span>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome">
          <div>
            <span className="eyebrow">YOUR ROBOTICS WORKSPACE</span>
            <h1>Never lose an Arduino again.</h1>
            <p>A little order for all the things you love to build.</p>
          </div>
          <div className="welcome__stamp"><Icon name="check" size={16} /> Lab-ready inventory</div>
        </section>

        {successMessage && (
          <div className="success-message" role="status">
            <span className="success-message__icon"><Icon name="check" size={15} /></span>
            {successMessage}
            <button aria-label="Dismiss success message" className="success-message__dismiss" onClick={() => setSuccessMessage('')} type="button">
              <Icon name="close" size={15} />
            </button>
          </div>
        )}

        {loading ? (
          <div aria-live="polite" className="loading-panel">
            <span className="loader" />
            <p>Loading your inventory…</p>
          </div>
        ) : loadError ? (
          <section className="error-panel" role="alert">
            <span className="error-panel__mark">!</span>
            <h2>Unable to connect to the PartsPal server.</h2>
            <p>Check that the server is running, then try again.</p>
            <button className="button button--primary" onClick={loadParts} type="button">Retry</button>
          </section>
        ) : (
          <>
            <SummaryCards parts={parts} />

            <section aria-labelledby="inventory-title" className="inventory-panel">
              <div className="inventory-panel__heading">
                <div>
                  <span className="eyebrow">THE COLLECTION</span>
                  <h2 id="inventory-title">Inventory <span className="count-pill">{parts.length}</span></h2>
                  <p>Everything your next project needs, all in one place.</p>
                </div>
                <button className="button button--primary add-button" onClick={() => setIsFormOpen(true)} type="button">
                  <Icon name="plus" size={18} /> Add Part
                </button>
              </div>

              {parts.length > 0 ? (
                <>
                  <div className="toolbar">
                    <label className="search-field">
                      <Icon name="search" size={18} />
                      <span className="sr-only">Search parts</span>
                      <input onChange={(event) => setSearch(event.target.value)} placeholder="Search parts or categories…" type="search" value={search} />
                    </label>
                    <label className="category-select">
                      <span className="sr-only">Filter by category</span>
                      <select onChange={(event) => setCategory(event.target.value)} value={category}>
                        <option value="all">All Categories</option>
                        {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                  </div>
                  <InventoryTable parts={filteredParts} />
                  <div className="table-footer">
                    <span>Showing <strong>{filteredParts.length}</strong> of <strong>{parts.length}</strong> part types</span>
                    <span className="table-footer__note"><span /> Synced with your lab</span>
                  </div>
                </>
              ) : (
                <div className="empty-state empty-state--first">
                  <span className="empty-state__icon"><Icon name="boxes" size={25} /></span>
                  <h3>Your inventory is ready for its first part</h3>
                  <p>Add the components in your lab and keep every build moving.</p>
                  <button className="button button--primary" onClick={() => setIsFormOpen(true)} type="button">
                    <Icon name="plus" size={18} /> Add your first part
                  </button>
                </div>
              )}
            </section>
            <footer className="dashboard-footer">
              <span><span className="footer-dot" /> Made for curious minds &amp; messy workbenches.</span>
              <span>PARTSPAL · ROBOTICS LAB</span>
            </footer>
          </>
        )}
      </main>
      {isFormOpen && <AddPartForm onClose={() => setIsFormOpen(false)} onCreate={handleCreate} />}
    </div>
  )
}

export default App

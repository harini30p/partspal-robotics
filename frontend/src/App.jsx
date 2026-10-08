import { useEffect, useMemo, useState } from 'react'
import {
  createIssue,
  createKit,
  createKitIssue,
  createPart,
  getIssues,
  getKits,
  getParts,
  returnIssue,
} from './services/api'
import QRLabel from './components/QRLabel'

const initialForm = { name: '', category: '', total_quantity: '' }
const initialIssueForm = {
  part_id: '',
  kit_id: '',
  member_name: '',
  registration_number: '',
  due_date: '',
  quantity: '1',
}

function getLocalDateValue() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

async function fetchParts() {
  const result = await getParts()
  if (!Array.isArray(result?.parts)) {
    throw new Error('The server returned an invalid inventory response.')
  }
  return result.parts
}

async function fetchIssueData() {
  const [kitResult, issueResult] = await Promise.all([getKits(), getIssues()])
  if (!Array.isArray(kitResult?.kits) || !Array.isArray(issueResult?.issues)) {
    throw new Error('The server returned an invalid issues response.')
  }
  return { kits: kitResult.kits, issues: issueResult.issues }
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
  if (quantity === 0) {
    return <span className="status status--out">Out of Stock</span>
  }
  if (quantity <= 2) {
    return <span className="status status--low">Low Stock · {quantity}</span>
  }
  return <span className="status status--in">In Stock</span>
}

function InventoryTable({ parts, onShowQR }) {
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
            <th scope="col">Label</th>
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
              <td className={`quantity-cell ${Number(part.available_quantity) === 0 ? 'quantity-cell--out' : Number(part.available_quantity) <= 2 ? 'quantity-cell--low' : ''}`}>
                {part.available_quantity}
              </td>
              <td><PartStatus quantity={Number(part.available_quantity)} /></td>
              <td>
                <button
                  className="qr-label-action"
                  onClick={() => onShowQR({
                    kind: 'part',
                    name: part.name,
                    identifier: `PART-${part.id}`,
                    payload: `part:${part.id}`,
                  })}
                  type="button"
                >
                  QR Label
                </button>
              </td>
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

function IssueSection({ parts, kits, issues, loading, error, onRetry, onRefresh, onSuccess }) {
  const [mode, setMode] = useState('part')
  const [form, setForm] = useState(initialIssueForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [returningId, setReturningId] = useState(null)
  const [returnError, setReturnError] = useState('')
  const activeIssues = issues.filter((issue) => issue.status === 'issued')
  const selectedPart = parts.find((part) => Number(part.id) === Number(form.part_id))
  const requestedQuantity = Number(form.quantity)
  const availableQuantity = Number(selectedPart?.available_quantity || 0)
  const requestedQuantityIsValid = form.quantity !== ''
    && Number.isInteger(requestedQuantity)
    && requestedQuantity > 0
  const partStockWarning = selectedPart && requestedQuantityIsValid
    ? requestedQuantity > availableQuantity
      ? { kind: 'out', message: `Requested quantity (${requestedQuantity}) exceeds the ${availableQuantity} available.` }
      : availableQuantity - requestedQuantity === 0
        ? { kind: 'out', message: 'This checkout would leave the part out of stock.' }
        : availableQuantity - requestedQuantity <= 2
          ? { kind: 'low', message: `This checkout would leave low stock (${availableQuantity - requestedQuantity} remaining).` }
          : null
    : null
  const selectedKit = kits.find((kit) => Number(kit.id) === Number(form.kit_id))
  const kitStockWarnings = selectedKit?.parts?.flatMap((component) => {
    const stock = parts.find((part) => Number(part.id) === Number(component.id))
    const available = Number(stock?.available_quantity || 0)
    const required = Number(component.quantity)
    return available < required ? [{ name: component.name, required, available }] : []
  }) || []

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setFormError('')
  }

  async function handleIssueSubmit(event) {
    event.preventDefault()

    if (!form.member_name.trim()) {
      setFormError('Enter the borrower’s name.')
      return
    }
    if (!form.registration_number.trim()) {
      setFormError('Enter the borrower’s registration number.')
      return
    }
    if (!form.due_date || form.due_date < getLocalDateValue()) {
      setFormError('Choose a valid due date that is today or later.')
      return
    }

    let request
    if (mode === 'part') {
      const quantity = Number(form.quantity)
      const partId = Number(form.part_id)
      const selectedPart = parts.find((part) => Number(part.id) === partId)

      if (!selectedPart) {
        setFormError('Select a part to issue.')
        return
      }
      if (form.quantity === '' || !Number.isInteger(quantity) || quantity <= 0) {
        setFormError('Quantity must be a positive whole number.')
        return
      }
      request = createIssue({
        part_id: partId,
        member_name: form.member_name.trim(),
        registration_number: form.registration_number.trim(),
        due_date: form.due_date,
        quantity,
      })
    } else {
      const kitId = Number(form.kit_id)
      const selectedKitForIssue = kits.find((kit) => Number(kit.id) === kitId)

      if (!selectedKitForIssue) {
        setFormError('Select a kit to issue.')
        return
      }
      if (!selectedKitForIssue.parts?.length) {
        setFormError('This kit has no components and cannot be issued.')
        return
      }

      request = createKitIssue({
        kit_id: kitId,
        member_name: form.member_name.trim(),
        registration_number: form.registration_number.trim(),
        due_date: form.due_date,
      })
    }

    setSaving(true)
    setFormError('')
    try {
      await request
      setForm(initialIssueForm)
      onSuccess(mode === 'part' ? 'Part issue recorded.' : 'Kit issue recorded.')
      await onRefresh()
    } catch (issueError) {
      setFormError(issueError.message || 'Unable to record this issue. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReturn(issue) {
    setReturningId(issue.id)
    setReturnError('')
    try {
      await returnIssue(issue.id)
      onSuccess(`${issue.part_name || issue.kit_name} returned successfully.`)
      await onRefresh()
    } catch (issueError) {
      setReturnError(issueError.message || 'Unable to return this issue. Please try again.')
    } finally {
      setReturningId(null)
    }
  }

  return (
    <section aria-labelledby="issues-title" className="issues-panel">
      <div className="issues-panel__heading">
        <div>
          <span className="eyebrow">OUT IN THE LAB</span>
          <h2 id="issues-title">Issues <span className="count-pill">{issues.length}</span></h2>
          <p>See who has what, and when it’s due back.</p>
        </div>
        <span className="issues-panel__caption">WHO HAS WHAT</span>
      </div>

      {loading ? (
        <div aria-live="polite" className="issue-loading">
          <span className="loader" />
          <p>Loading issues and kits…</p>
        </div>
      ) : error ? (
        <div className="issue-load-error" role="alert">
          <p>{error}</p>
          <button className="button button--quiet" onClick={onRetry} type="button">Retry</button>
        </div>
      ) : (
        <>
          <div className="issue-layout">
            <form className="issue-form" onSubmit={handleIssueSubmit}>
              <div className="issue-form__heading">
                <h3>Check something out</h3>
                <p>Record a part or a complete kit.</p>
              </div>
              <div aria-label="Choose what to issue" className="issue-mode" role="group">
                <button
                  aria-pressed={mode === 'part'}
                  className={mode === 'part' ? 'issue-mode__button is-active' : 'issue-mode__button'}
                  onClick={() => { setMode('part'); setFormError('') }}
                  type="button"
                >
                  Individual part
                </button>
                <button
                  aria-pressed={mode === 'kit'}
                  className={mode === 'kit' ? 'issue-mode__button is-active' : 'issue-mode__button'}
                  onClick={() => { setMode('kit'); setFormError('') }}
                  type="button"
                >
                  Kit
                </button>
              </div>

              {mode === 'part' ? (
                <>
                  <div className="issue-item-fields">
                    <label className="issue-field">
                      Part
                      <select name="part_id" onChange={updateField} required value={form.part_id}>
                        <option value="">Choose a part</option>
                        {parts.map((part) => (
                          <option key={part.id} value={part.id}>
                            {part.name} · {part.available_quantity} available
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="issue-field">
                      Quantity
                      <input min="1" name="quantity" onChange={updateField} required step="1" type="number" value={form.quantity} />
                    </label>
                  </div>
                  {selectedPart && (
                    <div className="selected-stock">
                      <span className="selected-stock__current">
                        Available now <strong>{availableQuantity}</strong>
                      </span>
                      <PartStatus quantity={availableQuantity} />
                    </div>
                  )}
                  {partStockWarning && (
                    <div
                      aria-live="polite"
                      className={`stock-warning stock-warning--${partStockWarning.kind}`}
                      role="status"
                    >
                      <span className="stock-warning__icon">!</span>
                      <span>
                        <strong>{partStockWarning.kind === 'out' ? 'Stock warning' : 'Low stock warning'}</strong>
                        {partStockWarning.message} The server will confirm availability.
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <label className="issue-field issue-field--single">
                  Kit
                  <select name="kit_id" onChange={updateField} required value={form.kit_id}>
                    <option value="">Choose a kit</option>
                    {kits.map((kit) => (
                      <option key={kit.id} value={kit.id}>
                        {kit.name}{kit.parts?.length ? ` · ${kit.parts.length} components` : ' · no components'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {mode === 'kit' && selectedKit && (
                kitStockWarnings.length > 0 ? (
                  <div className="stock-warning stock-warning--out" role="status">
                    <span className="stock-warning__icon">!</span>
                    <div>
                      <strong>Not enough stock for this kit</strong>
                      <ul className="stock-warning__list">
                        {kitStockWarnings.map((warning) => (
                          <li key={warning.name}>
                            {warning.name}: requires {warning.required}, {warning.available} available
                          </li>
                        ))}
                      </ul>
                      <span>The server will confirm availability when you submit.</span>
                    </div>
                  </div>
                ) : selectedKit.parts?.length > 0 ? (
                  <div className="stock-warning stock-warning--ok" role="status">
                    <span className="stock-warning__icon">✓</span>
                    <span><strong>Kit stock looks good.</strong> All components currently meet the required quantities.</span>
                  </div>
                ) : null
              )}

              <label className="issue-field">
                Borrower name
                <input autoComplete="name" name="member_name" onChange={updateField} placeholder="e.g. Alex Morgan" required value={form.member_name} />
              </label>
              <label className="issue-field">
                Registration number
                <input name="registration_number" onChange={updateField} placeholder="e.g. 24RBT018" required value={form.registration_number} />
              </label>
              <label className="issue-field">
                Due date
                <input min={getLocalDateValue()} name="due_date" onChange={updateField} required type="date" value={form.due_date} />
              </label>

              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="button button--primary issue-submit" disabled={saving} type="submit">
                {saving ? 'Recording…' : mode === 'part' ? 'Issue part' : 'Issue kit'}
                {!saving && <Icon name="arrow" size={17} />}
              </button>
            </form>

            <div className="active-issues">
              <div className="active-issues__heading">
                <div>
                  <h3>Currently borrowed</h3>
                  <p>Active checkouts from your lab</p>
                </div>
                <span className="active-issues__count">{activeIssues.length} active</span>
              </div>
              {returnError && <p className="issue-return-error" role="alert">{returnError}</p>}
              {activeIssues.length === 0 ? (
                <div className="issue-empty">
                  <span className="empty-state__icon"><Icon name="check" size={23} /></span>
                  <h3>Nothing checked out</h3>
                  <p>When someone borrows a part or kit, it’ll show up here.</p>
                </div>
              ) : (
                <div className="table-scroll issue-table-scroll">
                  <table className="issue-table">
                    <thead>
                      <tr>
                        <th scope="col">Borrower</th>
                        <th scope="col">Item</th>
                        <th scope="col">Qty</th>
                        <th scope="col">Due back</th>
                        <th scope="col">Status</th>
                        <th scope="col"><span className="sr-only">Return action</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeIssues.map((issue) => {
                        const overdue = issue.due_date < getLocalDateValue()
                        return (
                          <tr className={overdue ? 'issue-row issue-row--overdue' : 'issue-row'} key={issue.id}>
                            <td>
                              <strong className="borrower-name">{issue.member_name}</strong>
                              <span className="borrower-id">{issue.registration_number}</span>
                            </td>
                            <td>
                              <strong className="issued-item">{issue.part_name || issue.kit_name || 'Unknown item'}</strong>
                              <span className="issued-kind">{issue.part_id ? 'Individual part' : 'Kit'}</span>
                            </td>
                            <td>{issue.part_id ? issue.quantity : '1 kit'}</td>
                            <td className={overdue ? 'due-date due-date--overdue' : 'due-date'}>
                              {issue.due_date}
                            </td>
                            <td>
                              <span className={overdue ? 'status status--overdue' : 'status status--in'}>
                                {overdue ? 'Overdue' : 'Issued'}
                              </span>
                            </td>
                            <td>
                              <button
                                className="return-button"
                                disabled={returningId !== null}
                                onClick={() => handleReturn(issue)}
                                type="button"
                              >
                                {returningId === issue.id ? 'Returning…' : 'Return'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function formatHistoryDate(value) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function MemberHistory({ issues, loading, error, onRetry }) {
  const [search, setSearch] = useState('')
  const normalizedQuery = search.trim().toLocaleLowerCase()
  const matchingIssues = issues.filter((issue) => (
    !normalizedQuery
    || issue.member_name?.toLocaleLowerCase().includes(normalizedQuery)
    || issue.registration_number?.toLocaleLowerCase().includes(normalizedQuery)
  ))

  return (
    <section aria-labelledby="member-history-title" className="history-panel">
      <div className="history-panel__heading">
        <div>
          <span className="eyebrow">EVERY CHECKOUT, ACCOUNTED FOR</span>
          <h2 id="member-history-title">Member History <span className="count-pill">{issues.length}</span></h2>
          <p>Search past and present checkouts by name or registration number.</p>
        </div>
        {!loading && !error && (
          <span className="history-panel__caption">{matchingIssues.length} {matchingIssues.length === 1 ? 'record' : 'records'}</span>
        )}
      </div>

      <label className="history-search">
        <Icon name="search" size={18} />
        <span className="sr-only">Search member name or registration number</span>
        <input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search member name or registration number…"
          type="search"
          value={search}
        />
      </label>

      {loading ? (
        <div aria-live="polite" className="history-message">
          <span className="loader" />
          <p>Loading member history…</p>
        </div>
      ) : error ? (
        <div className="history-message history-message--error" role="alert">
          <p>{error}</p>
          <button className="button button--quiet" onClick={onRetry} type="button">Retry</button>
        </div>
      ) : matchingIssues.length === 0 ? (
        <div className="history-empty">
          <span className="empty-state__icon"><Icon name="search" size={23} /></span>
          <h3>{normalizedQuery ? 'No matching history' : 'No issue history yet'}</h3>
          <p>
            {normalizedQuery
              ? 'Try another member name or registration number.'
              : 'Issued and returned parts and kits will appear here.'}
          </p>
        </div>
      ) : (
        <div className="table-scroll history-table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Item</th>
                <th scope="col">Qty</th>
                <th scope="col">Issued</th>
                <th scope="col">Due</th>
                <th scope="col">Returned</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {matchingIssues.map((issue) => {
                const active = issue.status === 'issued'
                const overdue = active && issue.due_date < getLocalDateValue()
                return (
                  <tr className={overdue ? 'history-row history-row--overdue' : 'history-row'} key={issue.id}>
                    <td>
                      <strong className="borrower-name">{issue.member_name}</strong>
                      <span className="borrower-id">{issue.registration_number}</span>
                    </td>
                    <td>
                      <strong className="issued-item">{issue.part_name || issue.kit_name || 'Unknown item'}</strong>
                      <span className="issued-kind">{issue.part_id ? 'Individual part' : 'Kit'}</span>
                    </td>
                    <td>{issue.part_id ? issue.quantity : '1 kit'}</td>
                    <td>{formatHistoryDate(issue.issued_at)}</td>
                    <td className={overdue ? 'due-date due-date--overdue' : 'due-date'}>
                      {formatHistoryDate(issue.due_date)}
                    </td>
                    <td>{formatHistoryDate(issue.returned_at)}</td>
                    <td>
                      <span className={overdue ? 'status status--overdue' : active ? 'status status--in' : 'status status--returned'}>
                        {overdue ? 'Overdue' : active ? 'Active' : 'Returned'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function KitSection({ parts, kits, loading, error, onCreate, onRetry, onShowQR }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [components, setComponents] = useState([{ part_id: '', quantity: '1' }])
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  function updateComponent(index, field, value) {
    setComponents((current) => current.map((component, rowIndex) => (
      rowIndex === index ? { ...component, [field]: value } : component
    )))
    setFormError('')
  }

  function addComponent() {
    setComponents((current) => [...current, { part_id: '', quantity: '1' }])
  }

  function removeComponent(index) {
    setComponents((current) => current.filter((_, rowIndex) => rowIndex !== index))
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!name.trim()) {
      setFormError('Enter a name for this kit.')
      return
    }
    if (components.length === 0) {
      setFormError('Add at least one part to the kit.')
      return
    }

    const selectedIds = new Set()
    const payloadParts = []
    for (const component of components) {
      const partId = Number(component.part_id)
      const quantity = Number(component.quantity)
      if (!parts.some((part) => Number(part.id) === partId)) {
        setFormError('Choose an existing part for every component.')
        return
      }
      if (selectedIds.has(partId)) {
        setFormError('Each part can only appear once in a kit. Update its quantity instead.')
        return
      }
      if (component.quantity === '' || !Number.isInteger(quantity) || quantity <= 0) {
        setFormError('Every component quantity must be a positive whole number.')
        return
      }
      selectedIds.add(partId)
      payloadParts.push({ part_id: partId, quantity })
    }

    setSaving(true)
    setFormError('')
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        parts: payloadParts,
      })
      setName('')
      setDescription('')
      setComponents([{ part_id: '', quantity: '1' }])
    } catch (createError) {
      setFormError(createError.message || 'Unable to create this kit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="kits-title" className="kits-panel">
      <div className="kits-panel__heading">
        <div>
          <span className="eyebrow">BUILT FOR YOUR NEXT PROJECT</span>
          <h2 id="kits-title">Kits <span className="count-pill">{kits.length}</span></h2>
          <p>Group the parts your team reaches for together.</p>
        </div>
      </div>

      <div className="kits-layout">
        <form className="kit-form" onSubmit={handleSubmit}>
          <div className="kit-form__heading">
            <h3>Create a custom kit</h3>
            <p>Choose any parts in your inventory and set quantities.</p>
          </div>
          <label className="issue-field">
            Kit name
            <input
              name="name"
              onChange={(event) => { setName(event.target.value); setFormError('') }}
              placeholder="e.g. Line-following robot"
              required
              value={name}
            />
          </label>
          <label className="issue-field">
            Description <span className="optional-label">Optional</span>
            <textarea
              name="description"
              onChange={(event) => { setDescription(event.target.value); setFormError('') }}
              placeholder="What can you build with this kit?"
              rows="2"
              value={description}
            />
          </label>

          <div className="kit-components">
            <div className="kit-components__heading">
              <span>Kit components</span>
              <span>{components.length} {components.length === 1 ? 'part' : 'parts'}</span>
            </div>
            {components.map((component, index) => (
              <div className="kit-component-row" key={index}>
                <label className="sr-only" htmlFor={`kit-part-${index}`}>Component {index + 1} part</label>
                <select
                  id={`kit-part-${index}`}
                  onChange={(event) => updateComponent(index, 'part_id', event.target.value)}
                  required
                  value={component.part_id}
                >
                  <option value="">Choose a part</option>
                  {parts.map((part) => (
                    <option
                      disabled={components.some((other, otherIndex) => (
                        otherIndex !== index && other.part_id === String(part.id)
                      ))}
                      key={part.id}
                      value={part.id}
                    >
                      {part.name} · {part.category}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`kit-quantity-${index}`}>Component {index + 1} quantity</label>
                <input
                  id={`kit-quantity-${index}`}
                  min="1"
                  onChange={(event) => updateComponent(index, 'quantity', event.target.value)}
                  placeholder="Qty"
                  required
                  step="1"
                  type="number"
                  value={component.quantity}
                />
                <button
                  aria-label={`Remove component ${index + 1}`}
                  className="kit-component-remove"
                  disabled={components.length === 1}
                  onClick={() => removeComponent(index)}
                  type="button"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}
            <button className="add-component-button" disabled={components.length >= parts.length} onClick={addComponent} type="button">
              <Icon name="plus" size={15} /> Add component
            </button>
            {parts.length === 0 && <p className="kit-form-hint">Add inventory parts before creating a kit.</p>}
          </div>

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="button button--primary kit-submit" disabled={saving || parts.length === 0} type="submit">
            {saving ? 'Creating kit…' : 'Create kit'}
            {!saving && <Icon name="arrow" size={17} />}
          </button>
        </form>

        <div className="kit-collection">
          <div className="kit-collection__heading">
            <div>
              <h3>Your kits</h3>
              <p>Ready-made collections for the lab</p>
            </div>
            <span className="active-issues__count">{kits.length} {kits.length === 1 ? 'kit' : 'kits'}</span>
          </div>
          {loading ? (
            <div aria-live="polite" className="kits-message">
              <span className="loader" />
              <p>Loading kits…</p>
            </div>
          ) : error ? (
            <div className="kits-message kits-message--error" role="alert">
              <p>{error}</p>
              <button className="button button--quiet" onClick={onRetry} type="button">Retry</button>
            </div>
          ) : kits.length === 0 ? (
            <div className="kits-message">
              <span className="empty-state__icon"><Icon name="boxes" size={23} /></span>
              <h3>No kits yet</h3>
              <p>Make your first custom kit from parts already in your inventory.</p>
            </div>
          ) : (
            <div className="kit-list">
              {kits.map((kit) => (
                <article className="kit-card" key={kit.id}>
                  <div className="kit-card__top">
                    <span className="kit-card__icon"><Icon name="boxes" size={18} /></span>
                    <div className="kit-card__title">
                      <h4>{kit.name}</h4>
                      <span>{kit.parts.length} {kit.parts.length === 1 ? 'component' : 'components'}</span>
                    </div>
                  </div>
                  {kit.description && <p className="kit-card__description">{kit.description}</p>}
                  {kit.parts.length > 0 ? (
                    <ul className="kit-card__parts">
                      {kit.parts.map((part) => (
                        <li key={part.id}>
                          <span>{part.name}</span>
                          <span className="kit-part-quantity">× {part.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="kit-card__empty">No components listed.</p>
                  )}
                  <button
                    className="qr-label-action kit-card__qr-action"
                    onClick={() => onShowQR({
                      kind: 'kit',
                      name: kit.name,
                      identifier: `KIT-${kit.id}`,
                      payload: `kit:${kit.id}`,
                    })}
                    type="button"
                  >
                    QR Label
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function App() {
  const [parts, setParts] = useState([])
  const [kits, setKits] = useState([])
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [issuesLoading, setIssuesLoading] = useState(true)
  const [issuesError, setIssuesError] = useState('')
  const [kitsLoading, setKitsLoading] = useState(true)
  const [kitsError, setKitsError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [qrLabel, setQrLabel] = useState(null)

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

  async function refreshIssues() {
    try {
      const data = await fetchIssueData()
      setKits(data.kits)
      setKitsError('')
      setIssues(data.issues)
      setIssuesError('')
    } catch (error) {
      setKitsError(error.message || 'Unable to load kits. Please try again.')
      setIssuesError(error.message || 'Unable to load issues. Please try again.')
    } finally {
      setKitsLoading(false)
      setIssuesLoading(false)
    }
  }

  async function refreshKits() {
    setKitsLoading(true)
    try {
      const result = await getKits()
      if (!Array.isArray(result?.kits)) {
        throw new Error('The server returned an invalid kits response.')
      }
      setKits(result.kits)
      setKitsError('')
    } catch (error) {
      setKitsError(error.message || 'Unable to load kits. Please try again.')
    } finally {
      setKitsLoading(false)
    }
  }

  async function handleCreateKit(kit) {
    await createKit(kit)
    setSuccessMessage(`${kit.name} kit created.`)
    await refreshKits()
  }

  async function retryIssues() {
    setIssuesLoading(true)
    setKitsLoading(true)
    setIssuesError('')
    setKitsError('')
    await refreshIssues()
  }

  async function refreshAfterIssueChange() {
    await Promise.all([
      refreshIssues(),
      fetchParts()
        .then(setParts)
        .catch(() => setLoadError(true)),
    ])
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

  useEffect(() => {
    let active = true
    fetchIssueData()
      .then((data) => {
        if (active) {
          setKits(data.kits)
          setKitsError('')
          setIssues(data.issues)
        }
      })
      .catch((error) => {
        if (active) {
          setKitsError(error.message || 'Unable to load kits. Please try again.')
          setIssuesError(error.message || 'Unable to load issues. Please try again.')
        }
      })
      .finally(() => {
        if (active) {
          setKitsLoading(false)
          setIssuesLoading(false)
        }
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
                  <InventoryTable onShowQR={setQrLabel} parts={filteredParts} />
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
            <KitSection
              error={kitsError}
              kits={kits}
              loading={kitsLoading}
              onCreate={handleCreateKit}
              onRetry={retryIssues}
              onShowQR={setQrLabel}
              parts={parts}
            />
            <IssueSection
              error={issuesError}
              issues={issues}
              kits={kits}
              loading={issuesLoading}
              onRefresh={refreshAfterIssueChange}
              onRetry={retryIssues}
              onSuccess={setSuccessMessage}
              parts={parts}
            />
            <MemberHistory
              error={issuesError}
              issues={issues}
              loading={issuesLoading}
              onRetry={retryIssues}
            />
            <footer className="dashboard-footer">
              <span><span className="footer-dot" /> Made for curious minds &amp; messy workbenches.</span>
              <span>PARTSPAL · ROBOTICS LAB</span>
            </footer>
          </>
        )}
      </main>
      {isFormOpen && <AddPartForm onClose={() => setIsFormOpen(false)} onCreate={handleCreate} />}
      {qrLabel && <QRLabel item={qrLabel} onClose={() => setQrLabel(null)} />}
    </div>
  )
}

export default App

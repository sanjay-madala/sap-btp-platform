import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import Modal from '../../components/admin/Modal'

interface UseCase {
  id: string
  title: string
  category: string
  sub_category: string
  scope: string | null
  timeline: string | null
  price: string | null
}

const emptyForm = { title: '', category: '', sub_category: '', scope: '', timeline: '', price: '' }

export default function UseCasesManager() {
  const [items, setItems] = useState<UseCase[]>([])
  const [filtered, setFiltered] = useState<UseCase[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<UseCase | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchAll = async () => {
    const { data } = await supabase.from('use_cases').select('*').order('category').order('title')
    setItems(data ?? [])
    setFiltered(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(items)
    } else {
      const q = search.toLowerCase()
      setFiltered(items.filter(uc =>
        uc.title.toLowerCase().includes(q) ||
        uc.category.toLowerCase().includes(q) ||
        uc.sub_category.toLowerCase().includes(q)
      ))
    }
  }, [search, items])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (uc: UseCase) => {
    setEditing(uc)
    setForm({
      title: uc.title,
      category: uc.category,
      sub_category: uc.sub_category,
      scope: uc.scope ?? '',
      timeline: uc.timeline ?? '',
      price: uc.price ?? '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      title: form.title,
      category: form.category,
      sub_category: form.sub_category,
      scope: form.scope || null,
      timeline: form.timeline || null,
      price: form.price || null,
    }
    if (editing) {
      await supabase.from('use_cases').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('use_cases').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    fetchAll()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this use case?')) return
    await supabase.from('use_cases').delete().eq('id', id)
    fetchAll()
  }

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Use Cases <span className="text-sm font-normal text-gray-500">({items.length})</span></h2>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + New Use Case
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by title, category, or sub-category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Sub-Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">Timeline</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Price</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((uc) => (
              <tr key={uc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{uc.title}</span>
                  {uc.scope && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{uc.scope}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{uc.category}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{uc.sub_category}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{uc.timeline ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{uc.price ?? '—'}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(uc)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDelete(uc.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">{search ? 'No matching use cases' : 'No use cases yet'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Use Case' : 'New Use Case'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. IT, Industry, LoB"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Category</label>
              <input value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })}
                placeholder="e.g. Data & Analytics"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
            <textarea value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timeline</label>
              <input value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                placeholder="e.g. 12-16 weeks"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="e.g. $150K-$250K"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={!form.title || !form.category || !form.sub_category || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

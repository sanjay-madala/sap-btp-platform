import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Modal from '../../components/admin/Modal'

interface Questionnaire {
  id: string
  title: string
  version: string
  description: string | null
  is_active: boolean
  created_at: string
}

const emptyForm = { title: '', version: '', description: '', is_active: false }

export default function QuestionnairesManager() {
  const [items, setItems] = useState<Questionnaire[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Questionnaire | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchAll = async () => {
    const { data } = await supabase
      .from('questionnaires')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (q: Questionnaire) => {
    setEditing(q)
    setForm({ title: q.title, version: q.version, description: q.description ?? '', is_active: q.is_active })
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    if (editing) {
      await supabase.from('questionnaires').update({
        title: form.title,
        version: form.version,
        description: form.description || null,
        is_active: form.is_active,
      }).eq('id', editing.id)
    } else {
      await supabase.from('questionnaires').insert({
        title: form.title,
        version: form.version,
        description: form.description || null,
        is_active: form.is_active,
      })
    }
    setSaving(false)
    setModalOpen(false)
    fetchAll()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this questionnaire and all its sections/questions?')) return
    await supabase.from('questionnaires').delete().eq('id', id)
    fetchAll()
  }

  const toggleActive = async (q: Questionnaire) => {
    await supabase.from('questionnaires').update({ is_active: !q.is_active }).eq('id', q.id)
    fetchAll()
  }

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Questionnaires</h2>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + New Questionnaire
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Version</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Active</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link to={`/admin/questionnaires/${q.id}/sections`} className="text-blue-600 hover:underline font-medium">
                    {q.title}
                  </Link>
                  {q.description && <p className="text-xs text-gray-500 mt-0.5">{q.description}</p>}
                </td>
                <td className="px-4 py-3 text-gray-700">{q.version}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive(q)}
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      q.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {q.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(q)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDelete(q.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No questionnaires yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Questionnaire' : 'New Questionnaire'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
            <input
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700">Set as active questionnaire</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.title || !form.version || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

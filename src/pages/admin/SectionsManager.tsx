import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Modal from '../../components/admin/Modal'

interface Section {
  id: string
  questionnaire_id: string
  title: string
  description: string | null
  order: number
}

export default function SectionsManager() {
  const { questionnaireId } = useParams<{ questionnaireId: string }>()
  const [sections, setSections] = useState<Section[]>([])
  const [qTitle, setQTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Section | null>(null)
  const [form, setForm] = useState({ title: '', description: '', order: 1 })
  const [saving, setSaving] = useState(false)

  const fetchAll = async () => {
    const [{ data: q }, { data }] = await Promise.all([
      supabase.from('questionnaires').select('title').eq('id', questionnaireId).single(),
      supabase.from('sections').select('*').eq('questionnaire_id', questionnaireId).order('order'),
    ])
    setQTitle(q?.title ?? '')
    setSections(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [questionnaireId])

  const openCreate = () => {
    setEditing(null)
    setForm({ title: '', description: '', order: (sections.length > 0 ? Math.max(...sections.map(s => s.order)) + 1 : 1) })
    setModalOpen(true)
  }

  const openEdit = (s: Section) => {
    setEditing(s)
    setForm({ title: s.title, description: s.description ?? '', order: s.order })
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      questionnaire_id: questionnaireId,
      title: form.title,
      description: form.description || null,
      order: form.order,
    }
    if (editing) {
      await supabase.from('sections').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('sections').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    fetchAll()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this section and all its questions?')) return
    await supabase.from('sections').delete().eq('id', id)
    fetchAll()
  }

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="mb-2">
        <Link to="/admin/questionnaires" className="text-sm text-blue-600 hover:underline">&larr; Back to Questionnaires</Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sections</h2>
          <p className="text-sm text-gray-500">{qTitle}</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + New Section
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">Order</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sections.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{s.order}</td>
                <td className="px-4 py-3">
                  <Link to={`/admin/questionnaires/${questionnaireId}/sections/${s.id}/questions`} className="text-blue-600 hover:underline font-medium">
                    {s.title}
                  </Link>
                  {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDelete(s.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {sections.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No sections yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Section' : 'New Section'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
            <input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 1 })}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={!form.title || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

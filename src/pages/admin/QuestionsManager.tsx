import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import Modal from '../../components/admin/Modal'

interface Question {
  id: string
  section_id: string
  question_text: string
  question_type: 'MultipleChoice' | 'YesNo' | 'Checkbox'
  options: string[] | null
  order: number
}

const questionTypes = ['MultipleChoice', 'YesNo', 'Checkbox'] as const

export default function QuestionsManager() {
  const { questionnaireId, sectionId } = useParams<{ questionnaireId: string; sectionId: string }>()
  const [questions, setQuestions] = useState<Question[]>([])
  const [sectionTitle, setSectionTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Question | null>(null)
  const [form, setForm] = useState({
    question_text: '',
    question_type: 'YesNo' as Question['question_type'],
    options: '',
    order: 1,
  })
  const [saving, setSaving] = useState(false)

  const fetchAll = async () => {
    const [{ data: sec }, { data }] = await Promise.all([
      supabase.from('sections').select('title').eq('id', sectionId).single(),
      supabase.from('questions').select('*').eq('section_id', sectionId).order('order'),
    ])
    setSectionTitle(sec?.title ?? '')
    setQuestions(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [sectionId])

  const openCreate = () => {
    setEditing(null)
    setForm({
      question_text: '',
      question_type: 'YesNo',
      options: '',
      order: questions.length > 0 ? Math.max(...questions.map(q => q.order)) + 1 : 1,
    })
    setModalOpen(true)
  }

  const openEdit = (q: Question) => {
    setEditing(q)
    setForm({
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options ? q.options.join('\n') : '',
      order: q.order,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const optionsArray = form.options
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean)

    const payload = {
      section_id: sectionId,
      question_text: form.question_text,
      question_type: form.question_type,
      options: optionsArray.length > 0 ? optionsArray : null,
      order: form.order,
    }

    if (editing) {
      await supabase.from('questions').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('questions').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    fetchAll()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('questions').delete().eq('id', id)
    fetchAll()
  }

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="mb-2">
        <Link to={`/admin/questionnaires/${questionnaireId}/sections`} className="text-sm text-blue-600 hover:underline">&larr; Back to Sections</Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Questions</h2>
          <p className="text-sm text-gray-500">{sectionTitle}</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + New Question
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Question</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {questions.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{q.order}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{q.question_text}</span>
                  {q.options && (
                    <p className="text-xs text-gray-400 mt-0.5">{q.options.length} options</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                    {q.question_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(q)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDelete(q.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {questions.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No questions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Question' : 'New Question'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
            <textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={form.question_type} onChange={(e) => setForm({ ...form, question_type: e.target.value as Question['question_type'] })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              {questionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Options (one per line)</label>
            <textarea
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
              rows={4}
              placeholder={form.question_type === 'YesNo' ? 'Yes\nNo' : 'Option 1\nOption 2\nOption 3'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">For YesNo type, enter "Yes" and "No" on separate lines</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
            <input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 1 })}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={!form.question_text || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

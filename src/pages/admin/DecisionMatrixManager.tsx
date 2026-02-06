import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import Modal from '../../components/admin/Modal'

interface MatrixEntry {
  id: string
  question_id: string
  use_case_id: string
  triggering_answer: string
  question: { question_text: string; options: string[] | null } | null
  use_case: { title: string } | null
}

interface QuestionOption {
  id: string
  question_text: string
  options: string[] | null
  section: { title: string } | null
}

interface UseCaseOption {
  id: string
  title: string
}

export default function DecisionMatrixManager() {
  const [entries, setEntries] = useState<MatrixEntry[]>([])
  const [questions, setQuestions] = useState<QuestionOption[]>([])
  const [useCases, setUseCases] = useState<UseCaseOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MatrixEntry | null>(null)
  const [form, setForm] = useState({ question_id: '', use_case_id: '', triggering_answer: '' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const fetchAll = async () => {
    const [{ data: matrixData }, { data: qData }, { data: ucData }] = await Promise.all([
      supabase.from('decision_matrix')
        .select('id, question_id, use_case_id, triggering_answer, question:questions(question_text, options), use_case:use_cases(title)')
        .order('created_at', { ascending: false }),
      supabase.from('questions').select('id, question_text, options, section:sections(title)').order('question_text'),
      supabase.from('use_cases').select('id, title').order('title'),
    ])
    setEntries((matrixData as unknown as MatrixEntry[]) ?? [])
    setQuestions((qData as unknown as QuestionOption[]) ?? [])
    setUseCases(ucData ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const selectedQuestion = questions.find((q) => q.id === form.question_id)
  const availableAnswers = selectedQuestion?.options ?? []

  const openCreate = () => {
    setEditing(null)
    setForm({ question_id: '', use_case_id: '', triggering_answer: '' })
    setModalOpen(true)
  }

  const openEdit = (entry: MatrixEntry) => {
    setEditing(entry)
    setForm({
      question_id: entry.question_id,
      use_case_id: entry.use_case_id,
      triggering_answer: entry.triggering_answer,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      question_id: form.question_id,
      use_case_id: form.use_case_id,
      triggering_answer: form.triggering_answer,
    }
    if (editing) {
      await supabase.from('decision_matrix').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('decision_matrix').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    fetchAll()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this mapping?')) return
    await supabase.from('decision_matrix').delete().eq('id', id)
    fetchAll()
  }

  const filtered = search.trim()
    ? entries.filter((e) => {
        const q = search.toLowerCase()
        return (
          e.question?.question_text?.toLowerCase().includes(q) ||
          e.use_case?.title?.toLowerCase().includes(q) ||
          e.triggering_answer.toLowerCase().includes(q)
        )
      })
    : entries

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Decision Matrix <span className="text-sm font-normal text-gray-500">({entries.length})</span></h2>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + New Mapping
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by question, use case, or answer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Question</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-36">Triggering Answer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Use Case</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 text-xs">{entry.question?.question_text ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    {entry.triggering_answer}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs">{entry.use_case?.title ?? '—'}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(entry)} className="text-blue-600 hover:underline text-xs">Edit</button>
                  <button onClick={() => handleDelete(entry.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{search ? 'No matching entries' : 'No mappings yet'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Mapping' : 'New Mapping'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <select
              value={form.question_id}
              onChange={(e) => setForm({ ...form, question_id: e.target.value, triggering_answer: '' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Select a question...</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  [{q.section?.title}] {q.question_text}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Triggering Answer</label>
            {availableAnswers.length > 0 ? (
              <select
                value={form.triggering_answer}
                onChange={(e) => setForm({ ...form, triggering_answer: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select an answer...</option>
                {availableAnswers.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                value={form.triggering_answer}
                onChange={(e) => setForm({ ...form, triggering_answer: e.target.value })}
                placeholder="Type the triggering answer"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Use Case</label>
            <select
              value={form.use_case_id}
              onChange={(e) => setForm({ ...form, use_case_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Select a use case...</option>
              {useCases.map((uc) => (
                <option key={uc.id} value={uc.id}>{uc.title}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.question_id || !form.use_case_id || !form.triggering_answer || saving}
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

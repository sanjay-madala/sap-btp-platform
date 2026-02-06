import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

interface Stats {
  questionnaires: number
  questions: number
  useCases: number
  submissions: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ questionnaires: 0, questions: 0, useCases: 0, submissions: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const [q, qs, uc, sub] = await Promise.all([
        supabase.from('questionnaires').select('id', { count: 'exact', head: true }),
        supabase.from('questions').select('id', { count: 'exact', head: true }),
        supabase.from('use_cases').select('id', { count: 'exact', head: true }),
        supabase.from('submissions').select('id', { count: 'exact', head: true }),
      ])
      setStats({
        questionnaires: q.count ?? 0,
        questions: qs.count ?? 0,
        useCases: uc.count ?? 0,
        submissions: sub.count ?? 0,
      })
      setLoading(false)
    }
    fetchStats()
  }, [])

  const cards = [
    { label: 'Questionnaires', value: stats.questionnaires, to: '/admin/questionnaires', color: 'bg-blue-500' },
    { label: 'Questions', value: stats.questions, to: '/admin/questionnaires', color: 'bg-indigo-500' },
    { label: 'Use Cases', value: stats.useCases, to: '/admin/use-cases', color: 'bg-purple-500' },
    { label: 'Submissions', value: stats.submissions, to: '#', color: 'bg-green-500' },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          Loading stats...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className={`inline-block px-2 py-1 rounded text-xs font-medium text-white ${card.color} mb-3`}>
                {card.label}
              </div>
              <div className="text-3xl font-bold text-gray-900">{card.value}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

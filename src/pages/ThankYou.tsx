import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

interface UseCase {
  id: string
  title: string
  category: string
  sub_category: string
  engagement_category: string | null
  whats_included: string | null
  key_deliverables: string | null
  why_it_matters: string | null
  how_its_delivered: string | null
  use_case_number: number | null
  score: number
}

interface CapturedResponse {
  sectionTitle: string
  questionText: string
  answer: string | string[]
}

interface Phase {
  key: string
  label: string
  description: string
  color: { bg: string; text: string; border: string; headerBg: string }
}

const phases: Phase[] = [
  {
    key: 'A',
    label: 'Phase 1: Quick Wins',
    description: 'Fixed-scope engagements with well-defined deliverables — ready to start immediately',
    color: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200', headerBg: 'bg-green-600' },
  },
  {
    key: 'B',
    label: 'Phase 2: Discovery & Build',
    description: 'Require a discovery phase to scope, followed by focused implementation',
    color: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', headerBg: 'bg-blue-600' },
  },
  {
    key: 'C',
    label: 'Phase 3: Strategic Initiatives',
    description: 'Complex, high-impact programs requiring detailed assessment and phased delivery',
    color: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', headerBg: 'bg-orange-600' },
  },
]

function RelevanceBadge({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = Math.round((score / maxScore) * 100)
  let color = 'bg-gray-100 text-gray-600'
  if (pct >= 70) color = 'bg-green-100 text-green-700'
  else if (pct >= 40) color = 'bg-blue-100 text-blue-700'
  else if (pct >= 20) color = 'bg-yellow-100 text-yellow-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {pct}% match
    </span>
  )
}

export default function ThankYou() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const [allUseCases, setAllUseCases] = useState<UseCase[]>([])
  const [capturedResponses, setCapturedResponses] = useState<CapturedResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedUc, setExpandedUc] = useState<string | null>(null)
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({})
  const [showResponses, setShowResponses] = useState(false)

  const maxScore = useMemo(() => {
    if (allUseCases.length === 0) return 1
    return Math.max(...allUseCases.map((uc) => uc.score), 1)
  }, [allUseCases])

  // Group use cases by phase (engagement_category) → sub_category
  const roadmap = useMemo(() => {
    return phases.map((phase) => {
      const phaseUseCases = allUseCases.filter(
        (uc) => uc.engagement_category === phase.key
      )
      // Group by sub_category
      const groups: Record<string, UseCase[]> = {}
      for (const uc of phaseUseCases) {
        const key = uc.sub_category || 'Other'
        if (!groups[key]) groups[key] = []
        groups[key].push(uc)
      }
      // Sort groups by highest score in group
      const sortedGroups = Object.entries(groups).sort(
        ([, a], [, b]) => Math.max(...b.map((u) => u.score)) - Math.max(...a.map((u) => u.score))
      )
      return { phase, groups: sortedGroups, total: phaseUseCases.length }
    }).filter((p) => p.total > 0)
  }, [allUseCases])

  useEffect(() => {
    async function loadResults() {
      try {
        await clientSideProcessing()

        // Fire-and-forget: invoke edge function for email
        supabase.functions.invoke('process-submission', {
          body: { submission_id: submissionId },
        }).catch(() => {})
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process results')
      } finally {
        setLoading(false)
      }
    }

    async function clientSideProcessing() {
      // Get all responses with question text
      const { data: responses, error: respErr } = await supabase
        .from('responses')
        .select('question_id, answer, questions(question_text, sections(title))')
        .eq('submission_id', submissionId)

      if (respErr || !responses) {
        throw new Error('Failed to fetch responses')
      }

      // Build captured responses list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const captured: CapturedResponse[] = responses.map((r: any) => ({
        sectionTitle: r.questions?.sections?.title || 'Unknown Section',
        questionText: r.questions?.question_text || 'Unknown Question',
        answer: r.answer,
      }))
      setCapturedResponses(captured)

      // Score use cases via decision matrix WITH WEIGHTS
      const useCaseScores: Record<string, number> = {}

      for (const response of responses) {
        const answerValue = response.answer
        const answersToCheck: string[] = Array.isArray(answerValue)
          ? answerValue
          : [answerValue]

        for (const answer of answersToCheck) {
          const { data: matches } = await supabase
            .from('decision_matrix')
            .select('use_case_id, weight')
            .eq('question_id', response.question_id)
            .eq('triggering_answer', answer)

          if (matches) {
            for (const match of matches) {
              const weight = (match as { use_case_id: string; weight: number }).weight || 1
              useCaseScores[match.use_case_id] =
                (useCaseScores[match.use_case_id] || 0) + weight
            }
          }
        }
      }

      // Filter by minimum score threshold and sort
      const MIN_SCORE = 3
      const sortedEntries = Object.entries(useCaseScores)
        .filter(([, score]) => score >= MIN_SCORE)
        .sort(([, a], [, b]) => b - a)

      const sortedIds = sortedEntries.map(([id]) => id)
      const scoreMap = Object.fromEntries(sortedEntries)

      if (sortedIds.length === 0) {
        setAllUseCases([])
        return
      }

      const { data: matchedUseCases } = await supabase
        .from('use_cases')
        .select('*')
        .in('id', sortedIds)

      if (matchedUseCases) {
        const ordered: UseCase[] = sortedIds
          .map((id) => {
            const uc = matchedUseCases.find((u) => u.id === id)
            if (!uc) return undefined
            return { ...uc, score: scoreMap[id] || 0 }
          })
          .filter((uc): uc is UseCase => uc !== undefined)
        setAllUseCases(ordered)
      }
    }

    loadResults()
  }, [submissionId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600 text-lg">Analyzing your responses...</p>
          <p className="mt-1 text-gray-500 text-sm">Building your personalized SAP BTP roadmap</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const togglePhase = (key: string) => {
    setCollapsedPhases((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto pt-8 pb-16">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Your SAP BTP Roadmap</h1>
          <p className="mt-2 text-gray-600 max-w-2xl mx-auto">
            Based on your responses, we've identified {allUseCases.length} recommended use cases organized into a phased implementation roadmap.
          </p>
        </div>

        {allUseCases.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <p className="text-gray-600">
              No specific recommendations were generated based on your responses.
              Our team will review your submission and reach out with tailored suggestions.
            </p>
          </div>
        ) : (
          <>
            {/* Roadmap Summary Bar */}
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Roadmap Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {roadmap.map(({ phase, total }) => (
                  <div key={phase.key} className={`rounded-xl p-4 ${phase.color.bg} ${phase.color.border} border`}>
                    <div className={`text-2xl font-bold ${phase.color.text}`}>{total}</div>
                    <div className={`text-sm font-medium ${phase.color.text}`}>{phase.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Phased Roadmap */}
            {roadmap.map(({ phase, groups, total }) => {
              const isCollapsed = collapsedPhases[phase.key]
              return (
                <div key={phase.key} className="mb-8">
                  {/* Phase Header */}
                  <button
                    onClick={() => togglePhase(phase.key)}
                    className={`w-full text-left rounded-t-2xl ${phase.color.headerBg} p-5 flex items-center justify-between`}
                  >
                    <div>
                      <h2 className="text-xl font-bold text-white">{phase.label}</h2>
                      <p className="text-white/80 text-sm mt-1">{phase.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                        {total} use case{total !== 1 ? 's' : ''}
                      </span>
                      <svg
                        className={`w-5 h-5 text-white transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div className={`bg-white rounded-b-2xl shadow-lg overflow-hidden border-x border-b ${phase.color.border}`}>
                      {groups.map(([subCat, useCases], groupIdx) => (
                        <div key={subCat}>
                          {/* Sub-category header */}
                          <div className={`px-6 py-3 ${groupIdx > 0 ? 'border-t' : ''} bg-gray-50`}>
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: phase.key === 'A' ? '#16a34a' : phase.key === 'B' ? '#2563eb' : '#ea580c' }} />
                              {subCat}
                              <span className="text-gray-400 font-normal normal-case">({useCases.length})</span>
                            </h3>
                          </div>

                          {/* Use cases in this sub-category */}
                          <div className="divide-y divide-gray-100">
                            {useCases.map((uc, ucIdx) => {
                              const isTop = ucIdx < 3
                              const isExpanded = expandedUc === uc.id || isTop

                              return (
                                <div key={uc.id} className="hover:bg-gray-50/50 transition-colors">
                                  <button
                                    onClick={() => {
                                      if (isTop) return
                                      setExpandedUc(expandedUc === uc.id ? null : uc.id)
                                    }}
                                    className={`w-full text-left px-6 py-4 ${isTop ? 'cursor-default' : 'cursor-pointer'}`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1">
                                        <span className="font-semibold text-gray-900">
                                          {uc.use_case_number ? `#${uc.use_case_number} — ` : ''}{uc.title}
                                        </span>
                                        <div className="flex flex-wrap gap-2 mt-1.5">
                                          <RelevanceBadge score={uc.score} maxScore={maxScore} />
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                            {uc.category}
                                          </span>
                                        </div>
                                      </div>
                                      {!isTop && (
                                        <svg
                                          className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 mt-1 ${isExpanded ? 'rotate-180' : ''}`}
                                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      )}
                                    </div>
                                  </button>

                                  {isExpanded && (uc.why_it_matters || uc.whats_included || uc.key_deliverables || uc.how_its_delivered) && (
                                    <div className="px-6 pb-5 space-y-3">
                                      {uc.why_it_matters && (
                                        <div>
                                          <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">Why It Matters</h4>
                                          <p className="text-gray-700 text-sm leading-relaxed">{uc.why_it_matters}</p>
                                        </div>
                                      )}
                                      {uc.whats_included && (
                                        <div>
                                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">What's Included</h4>
                                          <p className="text-gray-600 text-sm leading-relaxed">{uc.whats_included}</p>
                                        </div>
                                      )}
                                      {uc.key_deliverables && (
                                        <div>
                                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Key Deliverables</h4>
                                          <p className="text-gray-600 text-sm leading-relaxed">{uc.key_deliverables}</p>
                                        </div>
                                      )}
                                      {uc.how_its_delivered && (
                                        <div>
                                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">How It's Delivered</h4>
                                          <p className="text-gray-600 text-sm leading-relaxed">{uc.how_its_delivered}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* Captured Responses — Collapsible */}
        {capturedResponses.length > 0 && (
          <div className="mb-10">
            <button
              onClick={() => setShowResponses(!showResponses)}
              className="w-full text-left flex items-center justify-between bg-white rounded-2xl shadow-lg p-5 hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Your Responses ({capturedResponses.length})
              </h2>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${showResponses ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showResponses && (
              <div className="bg-white rounded-b-2xl shadow-lg overflow-hidden -mt-4 pt-2">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Question</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-600">Answer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {capturedResponses.map((cr, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-700">{cr.questionText}</td>
                        <td className="px-6 py-3 text-gray-900 font-medium">
                          {Array.isArray(cr.answer) ? cr.answer.join(', ') : cr.answer}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-blue-800 text-sm">
            A copy of this roadmap along with your responses has been sent to our team. We will be in touch shortly to discuss next steps.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
          >
            Start a new assessment
          </Link>
        </div>
      </div>
    </div>
  )
}

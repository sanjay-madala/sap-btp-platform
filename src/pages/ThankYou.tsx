import { useEffect, useState } from 'react'
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
}

interface CapturedResponse {
  sectionTitle: string
  questionText: string
  answer: string | string[]
}

const categoryColors: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-green-100', text: 'text-green-800', label: 'Fixed Scope' },
  B: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Discovery + Fixed' },
  C: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'T-Shirt Sizing' },
}

function EngagementBadge({ category }: { category: string | null }) {
  if (!category) return null
  const style = categoryColors[category] || categoryColors.B
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      Category {category} — {style.label}
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

  useEffect(() => {
    async function loadResults() {
      try {
        // Always use client-side scoring for display (returns ALL matching use cases)
        await clientSideProcessing()

        // Fire-and-forget: invoke edge function for email side-effect
        supabase.functions.invoke('process-submission', {
          body: { submission_id: submissionId },
        }).catch(() => {
          // Edge function failure is non-critical — email may not send
        })
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

      // Score use cases via decision matrix
      const useCaseScores: Record<string, number> = {}

      for (const response of responses) {
        const answerValue = response.answer
        const answersToCheck: string[] = Array.isArray(answerValue)
          ? answerValue
          : [answerValue]

        for (const answer of answersToCheck) {
          const { data: matches } = await supabase
            .from('decision_matrix')
            .select('use_case_id')
            .eq('question_id', response.question_id)
            .eq('triggering_answer', answer)

          if (matches) {
            for (const match of matches) {
              useCaseScores[match.use_case_id] =
                (useCaseScores[match.use_case_id] || 0) + 1
            }
          }
        }
      }

      // Get ALL matching use cases sorted by score
      const sortedIds = Object.entries(useCaseScores)
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id)

      if (sortedIds.length === 0) {
        setAllUseCases([])
        return
      }

      const { data: matchedUseCases } = await supabase
        .from('use_cases')
        .select('*')
        .in('id', sortedIds)

      if (matchedUseCases) {
        const ordered = sortedIds
          .map((id) => matchedUseCases.find((uc) => uc.id === id))
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
          <p className="mt-1 text-gray-500 text-sm">Generating personalized recommendations</p>
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

  const topFive = allUseCases.slice(0, 5)
  const remaining = allUseCases.slice(5)

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
          <h1 className="text-3xl font-bold text-gray-900">Thank You!</h1>
          <p className="mt-2 text-gray-600">
            Your responses have been submitted. Here are your personalized SAP BTP recommendations.
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
            {/* Top 5 Recommendations — Detailed */}
            <div className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Top {Math.min(5, allUseCases.length)} Recommended Use Cases
              </h2>

              <div className="space-y-6">
                {topFive.map((uc, index) => (
                  <div key={uc.id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    {/* Card Header */}
                    <div className="p-6 border-b border-gray-100">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {uc.use_case_number ? `#${uc.use_case_number} — ` : ''}{uc.title}
                          </h3>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <EngagementBadge category={uc.engagement_category} />
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {uc.category}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                              {uc.sub_category}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-6 space-y-5">
                      {uc.why_it_matters && (
                        <div>
                          <h4 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-1">Why It Matters</h4>
                          <p className="text-gray-700 text-sm leading-relaxed">{uc.why_it_matters}</p>
                        </div>
                      )}

                      {uc.whats_included && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">What's Included</h4>
                          <p className="text-gray-600 text-sm leading-relaxed">{uc.whats_included}</p>
                        </div>
                      )}

                      {uc.key_deliverables && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Key Deliverables</h4>
                          <p className="text-gray-600 text-sm leading-relaxed">{uc.key_deliverables}</p>
                        </div>
                      )}

                      {uc.how_its_delivered && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">How It's Delivered</h4>
                          <p className="text-gray-600 text-sm leading-relaxed">{uc.how_its_delivered}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Additional Applicable Use Cases — Laundry List */}
            {remaining.length > 0 && (
              <div className="mb-10">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Additional Applicable Use Cases ({remaining.length})
                </h2>

                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {remaining.map((uc) => (
                      <div key={uc.id}>
                        <button
                          onClick={() => setExpandedUc(expandedUc === uc.id ? null : uc.id)}
                          className="w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <span className="font-medium text-gray-900 text-sm">
                                {uc.use_case_number ? `#${uc.use_case_number} — ` : ''}{uc.title}
                              </span>
                              <div className="flex gap-2 mt-1">
                                <EngagementBadge category={uc.engagement_category} />
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                  {uc.category} / {uc.sub_category}
                                </span>
                              </div>
                            </div>
                            <svg
                              className={`w-5 h-5 text-gray-400 transition-transform ${expandedUc === uc.id ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {expandedUc === uc.id && (
                          <div className="px-6 pb-4 space-y-3 bg-gray-50">
                            {uc.why_it_matters && (
                              <div>
                                <span className="text-xs font-semibold text-blue-700 uppercase">Why It Matters:</span>
                                <p className="text-gray-700 text-sm mt-0.5">{uc.why_it_matters}</p>
                              </div>
                            )}
                            {uc.whats_included && (
                              <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase">What's Included:</span>
                                <p className="text-gray-600 text-sm mt-0.5">{uc.whats_included}</p>
                              </div>
                            )}
                            {uc.key_deliverables && (
                              <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase">Key Deliverables:</span>
                                <p className="text-gray-600 text-sm mt-0.5">{uc.key_deliverables}</p>
                              </div>
                            )}
                            {uc.how_its_delivered && (
                              <div>
                                <span className="text-xs font-semibold text-gray-500 uppercase">How It's Delivered:</span>
                                <p className="text-gray-600 text-sm mt-0.5">{uc.how_its_delivered}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Captured Responses Summary */}
        {capturedResponses.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Your Responses
            </h2>
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
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
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-blue-800 text-sm">
            A copy of these recommendations along with your responses has been sent to our team. We will be in touch shortly.
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

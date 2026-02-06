import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

interface UseCase {
  id: string
  title: string
  category: string
  sub_category: string
  scope: string | null
  timeline: string | null
  price: string | null
}

export default function ThankYou() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const [useCases, setUseCases] = useState<UseCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function processSubmission() {
      try {
        // Try calling the edge function first
        const { data, error: fnError } = await supabase.functions.invoke(
          'process-submission',
          { body: { submission_id: submissionId } }
        )

        if (fnError) {
          // Edge function not deployed yet — fall back to client-side processing
          console.warn('Edge function not available, using client-side fallback:', fnError.message)
          await fallbackProcessing()
          return
        }

        if (data?.recommended_use_cases) {
          setUseCases(data.recommended_use_cases)
        }
      } catch {
        // Fallback to client-side processing
        await fallbackProcessing()
      } finally {
        setLoading(false)
      }
    }

    async function fallbackProcessing() {
      try {
        // Get all responses for this submission
        const { data: responses, error: respErr } = await supabase
          .from('responses')
          .select('question_id, answer')
          .eq('submission_id', submissionId)

        if (respErr || !responses) {
          throw new Error('Failed to fetch responses')
        }

        // For each response, find matching use cases in the decision matrix
        const useCaseScores: Record<string, number> = {}

        for (const response of responses) {
          const answerValue = response.answer
          // Handle both string and array answers
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

        // Get top 5 use cases sorted by score
        const sortedIds = Object.entries(useCaseScores)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([id]) => id)

        if (sortedIds.length === 0) {
          setUseCases([])
          return
        }

        const { data: topUseCases } = await supabase
          .from('use_cases')
          .select('*')
          .in('id', sortedIds)

        if (topUseCases) {
          // Maintain the score-based sort order
          const ordered = sortedIds
            .map((id) => topUseCases.find((uc) => uc.id === id))
            .filter((uc): uc is UseCase => uc !== undefined)
          setUseCases(ordered)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process results')
      }
    }

    processSubmission()
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-3xl mx-auto pt-12">
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

        {useCases.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <p className="text-gray-600">
              No specific recommendations were generated based on your responses.
              Our team will review your submission and reach out with tailored suggestions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {useCases.map((uc, index) => (
              <div key={uc.id} className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{uc.title}</h3>
                    <div className="flex gap-2 mt-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {uc.category}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {uc.sub_category}
                      </span>
                    </div>
                    {uc.scope && (
                      <p className="mt-3 text-gray-600 text-sm">{uc.scope}</p>
                    )}
                    <div className="mt-3 flex gap-6 text-sm text-gray-500">
                      {uc.timeline && (
                        <span>Timeline: <strong className="text-gray-700">{uc.timeline}</strong></span>
                      )}
                      {uc.price && (
                        <span>Est. Investment: <strong className="text-gray-700">{uc.price}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-blue-800 text-sm">
            A copy of these recommendations has been sent to our team. We will be in touch shortly.
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

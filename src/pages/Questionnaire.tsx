import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import ProgressBar from '../components/ProgressBar'
import MultipleChoiceQuestion from '../components/questions/MultipleChoiceQuestion'
import YesNoQuestion from '../components/questions/YesNoQuestion'
import CheckboxQuestion from '../components/questions/CheckboxQuestion'

interface Question {
  id: string
  question_text: string
  question_type: 'MultipleChoice' | 'YesNo' | 'Checkbox'
  options: string[] | null
  order: number
  condition_question_id: string | null
  condition_answer: string | null
}

interface Section {
  id: string
  title: string
  description: string | null
  order: number
  questions: Question[]
}

interface FlatQuestion {
  question: Question
  sectionTitle: string
}

export default function Questionnaire() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const navigate = useNavigate()

  const [flatQuestions, setFlatQuestions] = useState<FlatQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchQuestionnaire() {
      try {
        const { data: submission, error: subErr } = await supabase
          .from('submissions')
          .select('questionnaire_id')
          .eq('id', submissionId)
          .single()

        if (subErr || !submission) {
          throw new Error('Submission not found')
        }

        const { data: sections, error: secErr } = await supabase
          .from('sections')
          .select('id, title, description, order, questions(id, question_text, question_type, options, order, condition_question_id, condition_answer)')
          .eq('questionnaire_id', submission.questionnaire_id)
          .order('order', { ascending: true })

        if (secErr || !sections) {
          throw new Error('Failed to load questionnaire')
        }

        const flat: FlatQuestion[] = []
        const sortedSections = (sections as Section[]).sort((a, b) => a.order - b.order)

        for (const section of sortedSections) {
          const sortedQuestions = [...section.questions].sort((a, b) => a.order - b.order)
          for (const q of sortedQuestions) {
            flat.push({
              question: q,
              sectionTitle: section.title,
            })
          }
        }

        setFlatQuestions(flat)

        // Load existing responses
        const { data: existingResponses } = await supabase
          .from('responses')
          .select('question_id, answer')
          .eq('submission_id', submissionId)

        if (existingResponses) {
          const existing: Record<string, string | string[]> = {}
          for (const r of existingResponses) {
            existing[r.question_id] = r.answer
          }
          setAnswers(existing)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load questionnaire')
      } finally {
        setLoading(false)
      }
    }

    fetchQuestionnaire()
  }, [submissionId])

  // Filter questions based on conditional logic
  const visibleQuestions = useMemo(() => {
    return flatQuestions.filter(fq => {
      const q = fq.question
      if (!q.condition_question_id || !q.condition_answer) return true
      const condAnswer = answers[q.condition_question_id]
      if (condAnswer === undefined || condAnswer === null) return false
      if (Array.isArray(condAnswer)) return condAnswer.includes(q.condition_answer)
      return condAnswer === q.condition_answer
    })
  }, [flatQuestions, answers])

  const currentQ = visibleQuestions[currentIndex]
  const currentAnswer = currentQ ? answers[currentQ.question.id] ?? null : null

  const handleAnswerChange = useCallback((value: string | string[]) => {
    if (!currentQ) return
    setAnswers((prev) => ({ ...prev, [currentQ.question.id]: value }))
  }, [currentQ])

  const saveResponse = async (questionId: string, answer: string | string[]) => {
    await supabase
      .from('responses')
      .delete()
      .eq('submission_id', submissionId!)
      .eq('question_id', questionId)

    const { error } = await supabase
      .from('responses')
      .insert({
        submission_id: submissionId,
        question_id: questionId,
        answer: answer,
      })

    if (error) throw new Error('Failed to save response')
  }

  const handleNext = async () => {
    if (!currentQ || currentAnswer === null) return

    setSaving(true)
    try {
      await saveResponse(currentQ.question.id, currentAnswer)

      if (currentIndex < visibleQuestions.length - 1) {
        setCurrentIndex((prev) => prev + 1)
      } else {
        navigate(`/thank-you/${submissionId}`)
      }
    } catch {
      setError('Failed to save your answer. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  // When answers change, ensure currentIndex is still valid
  useEffect(() => {
    if (currentIndex >= visibleQuestions.length && visibleQuestions.length > 0) {
      setCurrentIndex(visibleQuestions.length - 1)
    }
  }, [visibleQuestions.length, currentIndex])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading questionnaire...</p>
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

  if (!currentQ) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">No questions found in this questionnaire.</p>
      </div>
    )
  }

  const isAnswered =
    currentAnswer !== null &&
    (Array.isArray(currentAnswer) ? currentAnswer.length > 0 : currentAnswer !== '')

  const isLastQuestion = currentIndex === visibleQuestions.length - 1

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <ProgressBar
            current={currentIndex + 1}
            total={visibleQuestions.length}
            sectionTitle={currentQ.sectionTitle}
          />

          <div className="min-h-[200px]">
            {currentQ.question.question_type === 'MultipleChoice' && (
              <MultipleChoiceQuestion
                question={currentQ.question.question_text}
                options={currentQ.question.options ?? []}
                value={typeof currentAnswer === 'string' ? currentAnswer : null}
                onChange={(v) => handleAnswerChange(v)}
              />
            )}

            {currentQ.question.question_type === 'YesNo' && (
              <YesNoQuestion
                question={currentQ.question.question_text}
                value={typeof currentAnswer === 'string' ? currentAnswer : null}
                onChange={(v) => handleAnswerChange(v)}
              />
            )}

            {currentQ.question.question_type === 'Checkbox' && (
              <CheckboxQuestion
                question={currentQ.question.question_text}
                options={currentQ.question.options ?? []}
                value={Array.isArray(currentAnswer) ? currentAnswer : []}
                onChange={(v) => handleAnswerChange(v)}
              />
            )}
          </div>

          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!isAnswered || saving}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving
                ? 'Saving...'
                : isLastQuestion
                  ? 'Submit & View Results'
                  : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

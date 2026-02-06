interface YesNoQuestionProps {
  question: string
  value: string | null
  onChange: (value: string) => void
}

export default function YesNoQuestion({
  question,
  value,
  onChange,
}: YesNoQuestionProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">{question}</h2>
      <div className="flex gap-4">
        {['Yes', 'No'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`flex-1 py-4 px-6 rounded-lg border-2 text-lg font-medium transition-all ${
              value === option
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

interface MultipleChoiceQuestionProps {
  question: string
  options: string[]
  value: string | null
  onChange: (value: string) => void
}

export default function MultipleChoiceQuestion({
  question,
  options,
  value,
  onChange,
}: MultipleChoiceQuestionProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">{question}</h2>
      <div className="space-y-3">
        {options.map((option) => (
          <label
            key={option}
            className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
              value === option
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <input
              type="radio"
              name="multiple-choice"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-3 text-gray-800">{option}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

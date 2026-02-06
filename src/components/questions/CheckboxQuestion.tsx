interface CheckboxQuestionProps {
  question: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
}

export default function CheckboxQuestion({
  question,
  options,
  value,
  onChange,
}: CheckboxQuestionProps) {
  const toggleOption = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option))
    } else {
      onChange([...value, option])
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{question}</h2>
      <p className="text-sm text-gray-500 mb-6">Select all that apply</p>
      <div className="space-y-3">
        {options.map((option) => (
          <label
            key={option}
            className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
              value.includes(option)
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <input
              type="checkbox"
              checked={value.includes(option)}
              onChange={() => toggleOption(option)}
              className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="ml-3 text-gray-800">{option}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

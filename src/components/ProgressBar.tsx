interface ProgressBarProps {
  current: number
  total: number
  sectionTitle: string
}

export default function ProgressBar({ current, total, sectionTitle }: ProgressBarProps) {
  const percentage = Math.round((current / total) * 100)

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-600">{sectionTitle}</span>
        <span className="text-sm text-gray-500">
          Question {current} of {total}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

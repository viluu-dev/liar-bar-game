'use client'

interface ChamberDotsProps {
  chamberIndex: number  // how many have been pulled (0-5)
  size?: 'sm' | 'md'
}

export default function ChamberDots({ chamberIndex, size = 'md' }: ChamberDotsProps) {
  const dotSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 6 }, (_, i) => {
        const used = i < chamberIndex
        return (
          <div
            key={i}
            title={used ? 'Fired' : 'Loaded'}
            className={`
              ${dotSize} rounded-full border transition-colors duration-300
              ${used
                ? 'bg-transparent border-gray-600'
                : 'bg-red-500 border-red-500 shadow-sm shadow-red-500/50'
              }
            `}
          />
        )
      })}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/apiClient'
import { useOnBackendConnected } from '@/hooks/useBackendConnection'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Types
interface HistoryEntry {
  type: 'pattern' | 'clear'
  pattern_name: string
  timestamp: string
  actual_time_seconds: number | null
  actual_time_formatted: string | null
  speed: number | null
  table_type: string | null
  total_coordinates: number | null
}

interface PatternMetadata {
  path: string
  name: string
  category: string
  date_modified: number
  coordinates_count: number
  estimated_duration?: string | null
}

type PreExecution = 'none' | 'adaptive' | 'clear_from_in' | 'clear_from_out' | 'clear_sideway'

const preExecutionOptions: { value: PreExecution; label: string }[] = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'clear_from_in', label: 'Clear From Center' },
  { value: 'clear_from_out', label: 'Clear From Perimeter' },
  { value: 'clear_sideway', label: 'Clear Sideways' },
  { value: 'none', label: 'None' },
]

export function HistoryPage() {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [preExecution, setPreExecution] = useState<PreExecution>(() => {
    const cached = localStorage.getItem('preExecution')
    return (cached as PreExecution) || 'adaptive'
  })
  const [isRunning, setIsRunning] = useState(false)

  // Pattern metadata for the selected entry
  const [patternMeta, setPatternMeta] = useState<PatternMetadata | null>(null)

  // Persist preExecution to localStorage
  useEffect(() => {
    localStorage.setItem('preExecution', preExecution)
  }, [preExecution])

  const fetchHistory = async () => {
    setIsLoading(true)
    try {
      const data = await apiClient.get<{
        entries: HistoryEntry[]
        total: number
        has_more: boolean
      }>('/api/execution_history?limit=200')
      setHistoryEntries(data.entries || [])
    } catch (error) {
      console.error('Error fetching history:', error)
      toast.error('Failed to load history')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [])

  // Refetch when backend reconnects
  useOnBackendConnected(() => {
    fetchHistory()
  })

  // Close sidebar when playback starts
  useEffect(() => {
    const handlePlaybackStarted = () => {
      setIsPanelOpen(false)
    }
    window.addEventListener('playback-started', handlePlaybackStarted)
    return () => window.removeEventListener('playback-started', handlePlaybackStarted)
  }, [])

  const handleEntryClick = async (entry: HistoryEntry) => {
    setSelectedEntry(entry)
    setIsPanelOpen(true)

    // Fetch pattern metadata
    try {
      const data = await apiClient.get<PatternMetadata[]>('/list_theta_rho_files_with_metadata')
      const pattern = data.find(p => p.path === entry.pattern_name || p.path.endsWith(`/${entry.pattern_name}`))
      setPatternMeta(pattern || null)
    } catch (error) {
      console.error('Error fetching pattern metadata:', error)
      setPatternMeta(null)
    }
  }

  const handleRunPattern = async () => {
    if (!selectedEntry) return

    setIsRunning(true)
    try {
      await apiClient.post('/run_theta_rho', {
        file_name: selectedEntry.pattern_name,
        clear_pattern: preExecution,
      })
      toast.success(`Running: ${selectedEntry.pattern_name}`)
      window.dispatchEvent(new CustomEvent('playback-started'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run pattern')
    } finally {
      setIsRunning(false)
    }
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return timestamp
    }
  }

  const getEntryIcon = (type: string) => {
    return type === 'clear' ? 'cleaning_services' : 'grain'
  }

  const getEntryColor = (type: string) => {
    return type === 'clear' ? 'text-amber-500' : 'text-primary'
  }

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto gap-4 sm:gap-6 py-3 sm:py-6 px-0 sm:px-4 overflow-hidden" style={{ height: 'calc(100dvh - 14rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))' }}>
      {/* Page Header */}
      <div className="space-y-0.5 sm:space-y-1 shrink-0 pl-1">
        <h1 className="text-xl font-semibold tracking-tight">Execution History</h1>
        <p className="text-xs text-muted-foreground">
          View all pattern executions and manual controls
        </p>
      </div>

      <Separator className="shrink-0" />

      {/* History List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="material-icons-outlined text-4xl text-muted-foreground animate-spin">
              sync
            </span>
          </div>
        ) : historyEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="p-4 rounded-full bg-muted">
              <span className="material-icons-outlined text-5xl">history</span>
            </div>
            <div className="text-center">
              <p className="font-medium">No execution history</p>
              <p className="text-sm">Patterns you run will appear here</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {historyEntries.map((entry, index) => (
              <button
                key={`${entry.timestamp}-${index}`}
                onClick={() => handleEntryClick(entry)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted transition-colors text-left ${
                  selectedEntry?.timestamp === entry.timestamp && selectedEntry?.pattern_name === entry.pattern_name
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : ''
                }`}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 ${getEntryColor(entry.type)}`}>
                  <span className="material-icons-outlined text-2xl">
                    {getEntryIcon(entry.type)}
                  </span>
                </div>

                {/* Pattern Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {entry.pattern_name.replace('.thr', '')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimestamp(entry.timestamp)}
                  </p>
                </div>

                {/* Duration */}
                {entry.actual_time_formatted && (
                  <div className="flex-shrink-0 bg-muted text-xs px-2 py-1 rounded-full font-medium">
                    {entry.actual_time_formatted}
                  </div>
                )}

                {/* Speed */}
                {entry.speed && (
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    {entry.speed} mm/min
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar Sheet */}
      <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md flex flex-col gap-4 overflow-y-auto"
        >
          {selectedEntry && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className={`material-icons-outlined ${getEntryColor(selectedEntry.type)}`}>
                    {getEntryIcon(selectedEntry.type)}
                  </span>
                  <span className="truncate">
                    {selectedEntry.pattern_name.replace('.thr', '')}
                  </span>
                </SheetTitle>
              </SheetHeader>

              {/* Entry Details */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="font-medium capitalize">{selectedEntry.type} Pattern</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Executed</p>
                    <p className="font-medium">{formatTimestamp(selectedEntry.timestamp)}</p>
                  </div>
                  {selectedEntry.actual_time_formatted && (
                    <div>
                      <p className="text-muted-foreground">Duration</p>
                      <p className="font-medium">{selectedEntry.actual_time_formatted}</p>
                    </div>
                  )}
                  {selectedEntry.speed && (
                    <div>
                      <p className="text-muted-foreground">Speed</p>
                      <p className="font-medium">{selectedEntry.speed} mm/min</p>
                    </div>
                  )}
                  {selectedEntry.total_coordinates && (
                    <div>
                      <p className="text-muted-foreground">Coordinates</p>
                      <p className="font-medium">{selectedEntry.total_coordinates.toLocaleString()}</p>
                    </div>
                  )}
                  {selectedEntry.table_type && (
                    <div>
                      <p className="text-muted-foreground">Table Type</p>
                      <p className="font-medium">{selectedEntry.table_type}</p>
                    </div>
                  )}
                </div>

                {/* Pattern Metadata (if available) */}
                {patternMeta && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Category</p>
                        <p className="font-medium">{patternMeta.category}</p>
                      </div>
                      {patternMeta.estimated_duration && (
                        <div>
                          <p className="text-muted-foreground">Estimated Duration</p>
                          <p className="font-medium">{patternMeta.estimated_duration}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <Separator />

                {/* Run Again Section */}
                <div className="space-y-3">
                  <Label>Run Again</Label>

                  <div className="space-y-2">
                    <Label htmlFor="preExecution" className="text-sm">
                      Clear Pattern
                    </Label>
                    <Select value={preExecution} onValueChange={(v) => setPreExecution(v as PreExecution)}>
                      <SelectTrigger id="preExecution">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {preExecutionOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleRunPattern}
                    disabled={isRunning}
                    className="w-full gap-2"
                  >
                    {isRunning ? (
                      <>
                        <span className="material-icons-outlined text-base animate-spin">sync</span>
                        Running...
                      </>
                    ) : (
                      <>
                        <span className="material-icons text-base">play_arrow</span>
                        Run Pattern
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

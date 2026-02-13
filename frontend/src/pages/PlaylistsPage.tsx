import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { apiClient } from '@/lib/apiClient'
import {
  initPreviewCacheDB,
  getPreviewsFromCache,
  savePreviewToCache,
} from '@/lib/previewCache'
import { fuzzyMatch } from '@/lib/utils'
import { useOnBackendConnected } from '@/hooks/useBackendConnection'
import type { PatternMetadata, PreviewData, SortOption, PreExecution, RunMode } from '@/lib/types'
import { preExecutionOptions } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export function PlaylistsPage() {
  // Playlists state
  const [playlists, setPlaylists] = useState<string[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(() => {
    return localStorage.getItem('playlist-selected')
  })
  const [playlistPatterns, setPlaylistPatterns] = useState<string[]>([])
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true)

  // All patterns for the picker modal
  const [allPatterns, setAllPatterns] = useState<PatternMetadata[]>([])
  const [previews, setPreviews] = useState<Record<string, PreviewData>>({})

  // Pattern execution history
  const [allPatternHistories, setAllPatternHistories] = useState<Record<string, {
    actual_time_formatted: string | null
    timestamp: string | null
  }>>({})

  // Pattern picker modal state
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [selectedPatternPaths, setSelectedPatternPaths] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [sortAsc, setSortAsc] = useState(true)

  // Favorites state (loaded from "Favorites" playlist)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // Create/Rename playlist modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [playlistToRename, setPlaylistToRename] = useState<string | null>(null)

  // Selected playlist item for playback start
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0)

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Hover preview state
  const [hoveredPattern, setHoveredPattern] = useState<string | null>(null)

  // Mobile view state - show content panel when a playlist is selected
  const [mobileShowContent, setMobileShowContent] = useState(false)

  // Swipe gesture to go back on mobile
  const swipeTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    swipeTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
  }
  const handleSwipeTouchEnd = (e: React.TouchEvent) => {
    if (!swipeTouchStartRef.current || !mobileShowContent) return
    const deltaX = e.changedTouches[0].clientX - swipeTouchStartRef.current.x
    const deltaY = e.changedTouches[0].clientY - swipeTouchStartRef.current.y

    // Swipe right to go back (positive X, more horizontal than vertical)
    if (deltaX > 80 && deltaX > Math.abs(deltaY)) {
      setMobileShowContent(false)
    }
    swipeTouchStartRef.current = null
  }

  // Playback settings - initialized from localStorage
  const [runMode, setRunMode] = useState<RunMode>(() => {
    const cached = localStorage.getItem('playlist-runMode')
    return (cached === 'single' || cached === 'indefinite') ? cached : 'single'
  })
  const [shuffle, setShuffle] = useState(() => {
    return localStorage.getItem('playlist-shuffle') === 'true'
  })
  const [pauseTime, setPauseTime] = useState(() => {
    const cached = localStorage.getItem('playlist-pauseTime')
    return cached ? Number(cached) : 5
  })
  const [pauseUnit, setPauseUnit] = useState<'sec' | 'min' | 'hr'>(() => {
    const cached = localStorage.getItem('playlist-pauseUnit')
    return (cached === 'sec' || cached === 'min' || cached === 'hr') ? cached : 'min'
  })
  const [clearPattern, setClearPattern] = useState<PreExecution>(() => {
    const cached = localStorage.getItem('preExecution')
    return (cached as PreExecution) || 'adaptive'
  })

  // Persist playback settings to localStorage
  useEffect(() => {
    localStorage.setItem('playlist-runMode', runMode)
  }, [runMode])
  useEffect(() => {
    localStorage.setItem('playlist-shuffle', String(shuffle))
  }, [shuffle])
  useEffect(() => {
    localStorage.setItem('playlist-pauseTime', String(pauseTime))
  }, [pauseTime])
  useEffect(() => {
    localStorage.setItem('playlist-pauseUnit', pauseUnit)
  }, [pauseUnit])
  useEffect(() => {
    localStorage.setItem('preExecution', clearPattern)
  }, [clearPattern])

  // Persist selected playlist to localStorage
  useEffect(() => {
    if (selectedPlaylist) {
      localStorage.setItem('playlist-selected', selectedPlaylist)
    } else {
      localStorage.removeItem('playlist-selected')
    }
  }, [selectedPlaylist])

  // Validate cached playlist exists and load its patterns after playlists load
  const initialLoadDoneRef = useRef(false)
  useEffect(() => {
    if (isLoadingPlaylists) return

    if (selectedPlaylist) {
      if (playlists.includes(selectedPlaylist)) {
        // Load patterns for cached playlist on initial load only
        if (!initialLoadDoneRef.current) {
          initialLoadDoneRef.current = true
          fetchPlaylistPatterns(selectedPlaylist)
        }
      } else {
        // Cached playlist no longer exists
        setSelectedPlaylist(null)
      }
    }
  }, [isLoadingPlaylists, playlists, selectedPlaylist])

  // Close modals when playback starts
  useEffect(() => {
    const handlePlaybackStarted = () => {
      setIsPickerOpen(false)
      setIsCreateModalOpen(false)
      setIsRenameModalOpen(false)
    }
    window.addEventListener('playback-started', handlePlaybackStarted)
    return () => window.removeEventListener('playback-started', handlePlaybackStarted)
  }, [])
  const [isRunning, setIsRunning] = useState(false)

  // Convert pause time to seconds based on unit
  const getPauseTimeInSeconds = () => {
    switch (pauseUnit) {
      case 'hr':
        return pauseTime * 3600
      case 'min':
        return pauseTime * 60
      default:
        return pauseTime
    }
  }

  // Helper to get clear pattern duration by name
  const getClearPatternDurationByName = useCallback((baseName: string): number | null => {
    // Look for patterns like "clear_from_in.thr", "clear_from_in_mini.thr", etc.
    const clearPatternFound = allPatterns.find(p =>
      p.name.startsWith(baseName) && p.path.startsWith('patterns/')
    )

    if (clearPatternFound?.estimated_duration) {
      const duration = clearPatternFound.estimated_duration
      let seconds = 0

      if (duration === '<1m') {
        seconds = 30
      } else {
        const hourMatch = duration.match(/(\d+)h/)
        const minMatch = duration.match(/(\d+)m/)

        if (hourMatch) seconds += parseInt(hourMatch[1]) * 3600
        if (minMatch) seconds += parseInt(minMatch[1]) * 60
      }

      return seconds
    }

    return null
  }, [allPatterns])

  // Get clear pattern duration from actual pattern files (in seconds)
  const estimateClearPatternDuration = useCallback((type: PreExecution): number => {
    if (type === 'none') return 0

    // Try to find actual clear pattern files and use their estimated durations
    let patternName = ''

    switch (type) {
      case 'clear_from_in':
        patternName = 'clear_from_in'
        break
      case 'clear_from_out':
        patternName = 'clear_from_out'
        break
      case 'clear_sideway':
        patternName = 'clear_sideway'
        break
      case 'adaptive':
        // For adaptive, average the in and out durations
        const inDuration = getClearPatternDurationByName('clear_from_in')
        const outDuration = getClearPatternDurationByName('clear_from_out')
        if (inDuration && outDuration) {
          return (inDuration + outDuration) / 2
        }
        return 105 // Fallback estimate
      default:
        return 0
    }

    return getClearPatternDurationByName(patternName) || 120 // Fallback to 2 min estimate
  }, [getClearPatternDurationByName])

  // Calculate playlist duration breakdown
  const playlistDurations = useMemo(() => {
    if (!selectedPlaylist || playlistPatterns.length === 0) {
      return null
    }

    let totalPatternSeconds = 0
    let totalClearSeconds = 0
    let totalPauseSeconds = 0

    const pausePerPattern = getPauseTimeInSeconds()

    // Calculate total pause time (between patterns, not after last one)
    if (playlistPatterns.length > 1) {
      totalPauseSeconds = pausePerPattern * (playlistPatterns.length - 1)
    }

    // Sum up pattern durations from allPatterns metadata
    playlistPatterns.forEach(path => {
      const patternMeta = allPatterns.find(p => p.path === path)
      if (patternMeta?.estimated_duration) {
        // Parse duration string like "5m", "1h 15m", "<1m"
        const duration = patternMeta.estimated_duration
        let seconds = 0

        if (duration === '<1m') {
          seconds = 30 // Estimate 30 seconds for <1m
        } else {
          const hourMatch = duration.match(/(\d+)h/)
          const minMatch = duration.match(/(\d+)m/)

          if (hourMatch) seconds += parseInt(hourMatch[1]) * 3600
          if (minMatch) seconds += parseInt(minMatch[1]) * 60
        }

        totalPatternSeconds += seconds

        // Add clear pattern duration if enabled
        if (clearPattern !== 'none') {
          // Estimate clear pattern duration based on type
          // These are approximations - could be fetched from backend if needed
          const clearDuration = estimateClearPatternDuration(clearPattern)
          totalClearSeconds += clearDuration
        }
      }
    })

    const totalSeconds = totalPatternSeconds + totalClearSeconds + totalPauseSeconds

    return {
      patterns: totalPatternSeconds,
      clears: totalClearSeconds,
      pauses: totalPauseSeconds,
      total: totalSeconds
    }
  }, [selectedPlaylist, playlistPatterns, allPatterns, clearPattern, pauseTime, pauseUnit, estimateClearPatternDuration])

  // Format seconds to days/hours/mins/secs
  const formatDuration = (totalSeconds: number): string => {
    if (totalSeconds === 0) return '0s'

    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = Math.floor(totalSeconds % 60)

    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (mins > 0) parts.push(`${mins}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

    return parts.join(' ')
  }

  // Preview loading
  const pendingPreviewsRef = useRef<Set<string>>(new Set())
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Initialize and fetch data
  useEffect(() => {
    initPreviewCacheDB().catch(() => {})
    fetchPlaylists()
    fetchAllPatterns()
    loadFavorites()

    // Cleanup on unmount: abort in-flight requests and clear pending queue
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      pendingPreviewsRef.current.clear()
    }
  }, [])

  // Refetch when backend reconnects
  useOnBackendConnected(() => {
    fetchPlaylists()
    fetchAllPatterns()
    loadFavorites()
  })

  const fetchPlaylists = async () => {
    setIsLoadingPlaylists(true)
    try {
      const data = await apiClient.get<string[]>('/list_all_playlists')
      // Backend returns array directly, not { playlists: [...] }
      setPlaylists(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching playlists:', error)
      toast.error('Failed to load playlists')
    } finally {
      setIsLoadingPlaylists(false)
    }
  }

  const fetchPlaylistPatterns = async (name: string) => {
    try {
      const data = await apiClient.get<{ files: string[] }>(`/get_playlist?name=${encodeURIComponent(name)}`)
      setPlaylistPatterns(data.files || [])
      setSelectedItemIndex(0) // Reset selection to first item

      // Previews are now lazy-loaded via IntersectionObserver in LazyPatternPreview
    } catch (error) {
      console.error('Error fetching playlist:', error)
      toast.error('Failed to load playlist')
      setPlaylistPatterns([])
    }
  }

  const fetchAllPatterns = async () => {
    try {
      // Fetch patterns and history in parallel
      const [data, historyData] = await Promise.all([
        apiClient.get<PatternMetadata[]>('/list_theta_rho_files_with_metadata'),
        apiClient.get<Record<string, { actual_time_formatted: string | null; timestamp: string | null }>>('/api/pattern_history_all')
      ])
      setAllPatterns(data)
      setAllPatternHistories(historyData)
    } catch (error) {
      console.error('Error fetching patterns:', error)
    }
  }

  // Load favorites from "Favorites" playlist
  const loadFavorites = async () => {
    try {
      const playlist = await apiClient.get<{ files?: string[] }>('/get_playlist?name=Favorites')
      setFavorites(new Set(playlist.files || []))
    } catch {
      // Favorites playlist doesn't exist yet - that's OK
    }
  }

  // Preview loading functions (similar to BrowsePage)
  const loadPreviewsForPaths = async (paths: string[]) => {
    const cachedPreviews = await getPreviewsFromCache(paths)

    if (cachedPreviews.size > 0) {
      const cachedData: Record<string, PreviewData> = {}
      cachedPreviews.forEach((previewData, path) => {
        cachedData[path] = previewData
      })
      setPreviews(prev => ({ ...prev, ...cachedData }))
    }

    const uncached = paths.filter(p => !cachedPreviews.has(p))
    if (uncached.length > 0) {
      fetchPreviewsBatch(uncached)
    }
  }

  const fetchPreviewsBatch = async (paths: string[]) => {
    const BATCH_SIZE = 10 // Process 10 patterns at a time to avoid overwhelming the backend

    // Create new AbortController for this batch of requests
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // Process in batches
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      // Check if aborted before each batch
      if (signal.aborted) break

      const batch = paths.slice(i, i + BATCH_SIZE)

      try {
        const data = await apiClient.post<Record<string, PreviewData>>('/preview_thr_batch', { file_names: batch }, signal)

        const newPreviews: Record<string, PreviewData> = {}
        for (const [path, previewData] of Object.entries(data)) {
          newPreviews[path] = previewData as PreviewData
          // Only cache valid previews (with image_data and no error)
          if (previewData && !(previewData as PreviewData).error) {
            savePreviewToCache(path, previewData as PreviewData)
          }
        }
        setPreviews(prev => ({ ...prev, ...newPreviews }))
      } catch (error) {
        // Stop processing if aborted, otherwise continue with next batch
        if (error instanceof Error && error.name === 'AbortError') break
        console.error('Error fetching previews batch:', error)
      }

      // Small delay between batches to reduce backend load
      if (i + BATCH_SIZE < paths.length) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }

  const requestPreview = useCallback((path: string) => {
    if (previews[path] || pendingPreviewsRef.current.has(path)) return

    pendingPreviewsRef.current.add(path)

    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current)
    }

    batchTimeoutRef.current = setTimeout(() => {
      const pathsToFetch = Array.from(pendingPreviewsRef.current)
      pendingPreviewsRef.current.clear()
      if (pathsToFetch.length > 0) {
        loadPreviewsForPaths(pathsToFetch)
      }
    }, 100)
  }, [previews])

  // Playlist CRUD operations
  const handleSelectPlaylist = (name: string) => {
    setSelectedPlaylist(name)
    fetchPlaylistPatterns(name)
    setMobileShowContent(true) // Show content panel on mobile
  }

  // Go back to playlist list on mobile
  const handleMobileBack = () => {
    setMobileShowContent(false)
  }

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      toast.error('Please enter a playlist name')
      return
    }

    const name = newPlaylistName.trim()
    try {
      await apiClient.post('/create_playlist', { playlist_name: name, files: [] })
      toast.success('Playlist created')
      setIsCreateModalOpen(false)
      setNewPlaylistName('')
      await fetchPlaylists()
      handleSelectPlaylist(name)
    } catch (error) {
      console.error('Create playlist error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create playlist')
    }
  }

  const handleRenamePlaylist = async () => {
    if (!playlistToRename || !newPlaylistName.trim()) return

    try {
      await apiClient.post('/rename_playlist', { old_name: playlistToRename, new_name: newPlaylistName.trim() })
      toast.success('Playlist renamed')
      setIsRenameModalOpen(false)
      setNewPlaylistName('')
      setPlaylistToRename(null)
      fetchPlaylists()
      if (selectedPlaylist === playlistToRename) {
        setSelectedPlaylist(newPlaylistName.trim())
      }
    } catch (error) {
      toast.error('Failed to rename playlist')
    }
  }

  const handleDeletePlaylist = async (name: string) => {
    if (!confirm(`Delete playlist "${name}"?`)) return

    try {
      await apiClient.delete('/delete_playlist', { playlist_name: name })
      toast.success('Playlist deleted')
      fetchPlaylists()
      if (selectedPlaylist === name) {
        setSelectedPlaylist(null)
        setPlaylistPatterns([])
      }
    } catch (error) {
      toast.error('Failed to delete playlist')
    }
  }

  const handleRemovePattern = async (index: number) => {
    if (!selectedPlaylist) return

    const newPatterns = [...playlistPatterns]
    newPatterns.splice(index, 1)

    try {
      await apiClient.post('/modify_playlist', { playlist_name: selectedPlaylist, files: newPatterns })
      setPlaylistPatterns(newPatterns)
      toast.success('Pattern removed')

      // Adjust selection after removal
      if (selectedItemIndex === index) {
        // If we removed the selected item, select the next one (or previous if it was last)
        setSelectedItemIndex(Math.min(selectedItemIndex, newPatterns.length - 1))
      } else if (selectedItemIndex > index) {
        // If we removed an item before the selected one, shift selection down
        setSelectedItemIndex(selectedItemIndex - 1)
      }
    } catch (error) {
      toast.error('Failed to remove pattern')
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    setHoveredPattern(null) // Clear hover preview during drag
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()

    if (draggedIndex === null || draggedIndex === dropIndex || !selectedPlaylist) return

    const newPatterns = [...playlistPatterns]
    const [draggedItem] = newPatterns.splice(draggedIndex, 1)
    newPatterns.splice(dropIndex, 0, draggedItem)

    try {
      await apiClient.post('/modify_playlist', { playlist_name: selectedPlaylist, files: newPatterns })
      setPlaylistPatterns(newPatterns)

      // Update selected index if it moved
      if (selectedItemIndex === draggedIndex) {
        setSelectedItemIndex(dropIndex)
      } else if (draggedIndex < selectedItemIndex && dropIndex >= selectedItemIndex) {
        setSelectedItemIndex(selectedItemIndex - 1)
      } else if (draggedIndex > selectedItemIndex && dropIndex <= selectedItemIndex) {
        setSelectedItemIndex(selectedItemIndex + 1)
      }
    } catch (error) {
      toast.error('Failed to reorder playlist')
    }

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  // Pattern picker modal
  const openPatternPicker = () => {
    setSelectedPatternPaths(new Set()) // Start with empty selection
    setSearchQuery('')
    setIsPickerOpen(true)
    // Previews are lazy-loaded via IntersectionObserver in LazyPatternPreview
  }

  const handleSavePatterns = async () => {
    if (!selectedPlaylist) return

    const patternsToAdd = Array.from(selectedPatternPaths)

    if (patternsToAdd.length === 0) {
      setIsPickerOpen(false)
      return
    }

    // Insert patterns after the selected item
    const newPatterns = [...playlistPatterns]
    const insertIndex = selectedItemIndex + 1
    newPatterns.splice(insertIndex, 0, ...patternsToAdd)

    try {
      await apiClient.post('/modify_playlist', { playlist_name: selectedPlaylist, files: newPatterns })
      setPlaylistPatterns(newPatterns)
      // Set selection to the last newly added item
      setSelectedItemIndex(insertIndex + patternsToAdd.length - 1)
      setIsPickerOpen(false)
      toast.success(`Added ${patternsToAdd.length} pattern${patternsToAdd.length !== 1 ? 's' : ''} after item ${selectedItemIndex + 1}`)
      // Previews are lazy-loaded via IntersectionObserver
    } catch (error) {
      toast.error('Failed to update playlist')
    }
  }

  const togglePatternSelection = (path: string) => {
    setSelectedPatternPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Run playlist
  const handleRunPlaylist = async () => {
    if (!selectedPlaylist || playlistPatterns.length === 0) return

    setIsRunning(true)
    try {
      await apiClient.post('/run_playlist', {
        playlist_name: selectedPlaylist,
        run_mode: runMode === 'indefinite' ? 'indefinite' : 'single',
        pause_time: getPauseTimeInSeconds(),
        clear_pattern: clearPattern,
        shuffle: shuffle,
        start_index: selectedItemIndex, // Start from selected item
      })
      const startMsg = selectedItemIndex > 0
        ? `Started playlist from item ${selectedItemIndex + 1}`
        : `Started playlist: ${selectedPlaylist}`
      toast.success(startMsg)
      // Trigger Now Playing bar to open
      window.dispatchEvent(new CustomEvent('playback-started'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run playlist')
    } finally {
      setIsRunning(false)
    }
  }

  // Filter and sort patterns for picker
  const categories = useMemo(() => {
    const cats = new Set(allPatterns.map(p => p.category))
    return ['all', ...Array.from(cats).sort()]
  }, [allPatterns])

  const filteredPatterns = useMemo(() => {
    let filtered = allPatterns

    if (searchQuery) {
      filtered = filtered.filter(p => fuzzyMatch(p.name, searchQuery))
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category === selectedCategory)
    }

    filtered = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'date':
          cmp = a.date_modified - b.date_modified
          break
        case 'size':
          cmp = a.coordinates_count - b.coordinates_count
          break
        case 'favorites': {
          const aFav = favorites.has(a.path) ? 1 : 0
          const bFav = favorites.has(b.path) ? 1 : 0
          cmp = bFav - aFav // Favorites first
          if (cmp === 0) {
            cmp = a.name.localeCompare(b.name) // Then by name
          }
          break
        }
      }
      return sortAsc ? cmp : -cmp
    })

    return filtered
  }, [allPatterns, searchQuery, selectedCategory, sortBy, sortAsc, favorites])

  // Get pattern name from path
  const getPatternName = (path: string) => {
    const pattern = allPatterns.find(p => p.path === path)
    return pattern?.name || path.split('/').pop()?.replace('.thr', '') || path
  }

  // Get preview URL (backend already returns full data URL)
  const getPreviewUrl = (path: string) => {
    const preview = previews[path]
    return preview?.image_data || null
  }

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto gap-4 sm:gap-6 py-3 sm:py-6 px-0 sm:px-4 overflow-hidden" style={{ height: 'calc(100dvh - 14rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))' }}>
      {/* Page Header */}
      <div className="space-y-0.5 sm:space-y-1 shrink-0 pl-1">
        <h1 className="text-xl font-semibold tracking-tight">Playlists</h1>
        <p className="text-xs text-muted-foreground">
          Create and manage pattern playlists
        </p>
      </div>

      <Separator className="shrink-0" />

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 relative overflow-hidden">
        {/* Playlists Sidebar - Full screen on mobile, sidebar on desktop */}
        <aside className={`w-full lg:w-64 shrink-0 bg-card border rounded-lg flex flex-col h-full overflow-hidden transition-transform duration-300 ease-in-out ${
          mobileShowContent ? '-translate-x-full lg:translate-x-0 absolute lg:relative inset-0 lg:inset-auto' : 'translate-x-0'
        }`}>
          <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
            <div>
              <h2 className="text-lg font-semibold">My Playlists</h2>
              <p className="text-sm text-muted-foreground">{playlists.length} playlist{playlists.length !== 1 ? 's' : ''}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setNewPlaylistName('')
                setIsCreateModalOpen(true)
              }}
            >
              <span className="material-icons-outlined text-xl">add</span>
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
          {isLoadingPlaylists ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <span className="text-sm">Loading...</span>
            </div>
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <span className="material-icons-outlined text-3xl">playlist_add</span>
              <span className="text-sm">No playlists yet</span>
            </div>
          ) : (
            playlists.map(name => (
              <div
                key={name}
                className={`group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  selectedPlaylist === name
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
                onClick={() => handleSelectPlaylist(name)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-icons-outlined text-lg">playlist_play</span>
                  <span className="truncate text-sm font-medium">{name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPlaylistToRename(name)
                      setNewPlaylistName(name)
                      setIsRenameModalOpen(true)
                    }}
                  >
                    <span className="material-icons-outlined text-base">edit</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/20"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeletePlaylist(name)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </nav>
      </aside>

        {/* Main Content - Slides in from right on mobile, swipe right to go back */}
        <main
          className={`flex-1 bg-card border rounded-lg flex flex-col overflow-hidden min-h-0 relative transition-transform duration-300 ease-in-out ${
            mobileShowContent ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 absolute lg:relative inset-0 lg:inset-auto'
          }`}
          onTouchStart={handleSwipeTouchStart}
          onTouchEnd={handleSwipeTouchEnd}
        >
          {/* Header */}
          <header className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Back button - mobile only */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 lg:hidden shrink-0"
                onClick={handleMobileBack}
              >
                <span className="material-icons-outlined">arrow_back</span>
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold truncate">
                  {selectedPlaylist || 'Select a Playlist'}
                </h2>
                {selectedPlaylist && playlistPatterns.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-sm text-muted-foreground">
                      {playlistPatterns.length} pattern{playlistPatterns.length !== 1 ? 's' : ''}
                    </p>
                    {playlistDurations && (
                      <div className="text-xs space-y-0.5">
                        <div className="font-semibold text-foreground">
                          Total: {formatDuration(playlistDurations.total)}
                        </div>
                        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>Patterns: {formatDuration(playlistDurations.patterns)}</span>
                          {playlistDurations.clears > 0 && (
                            <span>Clears: {formatDuration(playlistDurations.clears)}</span>
                          )}
                          {playlistDurations.pauses > 0 && (
                            <span>Pauses: {formatDuration(playlistDurations.pauses)}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Hover Preview - centered */}
            {selectedPlaylist && playlistPatterns.length > 0 && (
              <div className="flex-shrink-0 mx-4 hidden sm:block">
                {hoveredPattern ? (
                  <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-primary shadow-lg bg-muted">
                    <LazyPatternPreview
                      path={hoveredPattern}
                      previewUrl={getPreviewUrl(hoveredPattern)}
                      requestPreview={requestPreview}
                      alt={getPatternName(hoveredPattern)}
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground text-center px-2">Hover to preview</p>
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={openPatternPicker}
              disabled={!selectedPlaylist}
              size="sm"
              className="gap-2"
            >
              <span className="material-icons-outlined text-base">add</span>
              <span className="hidden sm:inline">Add Patterns</span>
            </Button>
          </header>

          {/* Patterns List */}
          <div className={`flex-1 overflow-y-auto p-4 min-h-0 ${selectedPlaylist ? 'pb-28 sm:pb-24' : ''}`}>
            {!selectedPlaylist ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <div className="p-4 rounded-full bg-muted">
                  <span className="material-icons-outlined text-5xl">touch_app</span>
                </div>
                <div className="text-center">
                  <p className="font-medium">No playlist selected</p>
                  <p className="text-sm">Select a playlist from the sidebar to view its patterns</p>
                </div>
              </div>
            ) : playlistPatterns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <div className="p-4 rounded-full bg-muted">
                  <span className="material-icons-outlined text-5xl">library_music</span>
                </div>
                <div className="text-center">
                  <p className="font-medium">Empty playlist</p>
                  <p className="text-sm">Add patterns to get started</p>
                </div>
                <Button variant="secondary" className="mt-2 gap-2" onClick={openPatternPicker}>
                  <span className="material-icons-outlined text-base">add</span>
                  Add Patterns
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {playlistPatterns.map((path, index) => {
                  const patternMeta = allPatterns.find(p => p.path === path)
                  const isSelected = index === selectedItemIndex
                  const isDragging = index === draggedIndex
                  const isDragOver = index === dragOverIndex
                  // Get last run time - extract filename from path (handles both "file.thr" and "patterns/file.thr")
                  const fileName = path.split('/').pop() || ''
                  const playTime = allPatternHistories[fileName]?.actual_time_formatted || null

                  return (
                    <div
                      key={`${path}-${index}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedItemIndex(index)}
                      onMouseEnter={() => setHoveredPattern(path)}
                      onMouseLeave={() => setHoveredPattern(null)}
                      className={`
                        flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all
                        ${isSelected ? 'bg-primary/10 border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'bg-card border-border hover:bg-muted'}
                        ${isDragging ? 'opacity-50' : ''}
                        ${isDragOver && !isDragging ? 'border-primary border-t-2' : ''}
                      `}
                    >
                      {/* Drag handle */}
                      <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground">
                        <span className="material-icons-outlined text-base">drag_indicator</span>
                      </div>

                      {/* Index number */}
                      <div className="flex-shrink-0 w-7 text-center">
                        <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                          {index + 1}
                        </span>
                      </div>

                      {/* Pattern name */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{getPatternName(path)}</p>
                      </div>

                      {/* Estimated duration badge - blue/primary */}
                      {patternMeta?.estimated_duration && (
                        <div className="flex-shrink-0 bg-primary/90 backdrop-blur-sm text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-primary shadow-sm">
                          {patternMeta.estimated_duration}
                        </div>
                      )}

                      {/* Last run time badge - gray */}
                      {playTime && (
                        <div className="flex-shrink-0 bg-card/90 backdrop-blur-sm text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-border shadow-sm">
                          {(() => {
                            // Parse time and convert to minutes only (same logic as BrowsePage)
                            // Try MM:SS or HH:MM:SS format first (e.g., "15:48" or "1:15:48")
                            const colonMatch = playTime.match(/^(?:(\d+):)?(\d+):(\d+)$/)
                            if (colonMatch) {
                              const hours = colonMatch[1] ? parseInt(colonMatch[1]) : 0
                              const minutes = parseInt(colonMatch[2])
                              const seconds = parseInt(colonMatch[3])
                              const totalMins = hours * 60 + minutes + (seconds >= 30 ? 1 : 0)
                              return totalMins > 0 ? `${totalMins}m` : '<1m'
                            }

                            // Try text-based formats
                            const match = playTime.match(/(\d+)h\s*(\d+)m|(\d+)\s*min|(\d+)m\s*(\d+)s|(\d+)\s*sec/)
                            if (match) {
                              if (match[1] && match[2]) {
                                // "Xh Ym" format
                                return `${parseInt(match[1]) * 60 + parseInt(match[2])}m`
                              } else if (match[3]) {
                                // "X min" format
                                return `${match[3]}m`
                              } else if (match[4] && match[5]) {
                                // "Xm Ys" format - round to minutes
                                const mins = parseInt(match[4])
                                return mins > 0 ? `${mins}m` : '<1m'
                              } else if (match[6]) {
                                // seconds only
                                return '<1m'
                              }
                            }
                            // Fallback: show original
                            return playTime
                          })()}
                        </div>
                      )}

                      {/* Remove button */}
                      <button
                        className="flex-shrink-0 w-7 h-7 rounded-full hover:bg-destructive/20 text-destructive flex items-center justify-center transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemovePattern(index)
                        }}
                        title="Remove from playlist"
                      >
                        <span className="material-icons text-sm">close</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Floating Playback Controls */}
          {selectedPlaylist && (
            <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-20">
              {/* Blur backdrop */}
              <div className="h-20 bg-gradient-to-t" />

              {/* Controls container */}
              <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3 px-4 pointer-events-auto">
                {/* Control pill */}
                <div className="flex items-center h-12 sm:h-14 bg-card rounded-full shadow-xl border px-1.5 sm:px-2">
                  {/* Shuffle & Loop */}
                  <div className="flex items-center px-1 sm:px-2 border-r border-border gap-0.5 sm:gap-1">
                    <button
                      onClick={() => setShuffle(!shuffle)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition ${
                        shuffle
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                      title="Shuffle"
                    >
                      <span className="material-icons-outlined text-lg sm:text-xl">shuffle</span>
                    </button>
                    <button
                      onClick={() => setRunMode(runMode === 'indefinite' ? 'single' : 'indefinite')}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition ${
                        runMode === 'indefinite'
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                      title={runMode === 'indefinite' ? 'Loop mode' : 'Play once mode'}
                    >
                      <span className="material-icons-outlined text-lg sm:text-xl">repeat</span>
                    </button>
                  </div>

                  {/* Pause Time */}
                  <div className="flex items-center px-2 sm:px-3 gap-2 sm:gap-3 border-r border-border">
                    <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground tracking-wider hidden sm:block">Pause</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="w-7 h-7 sm:w-8 sm:h-8"
                        onClick={() => {
                          const step = pauseUnit === 'hr' ? 0.5 : 1
                          setPauseTime(Math.max(0, pauseTime - step))
                        }}
                      >
                        <span className="material-icons-outlined text-sm">remove</span>
                      </Button>
                      <button
                        onClick={() => {
                          const units: ('sec' | 'min' | 'hr')[] = ['sec', 'min', 'hr']
                          const currentIndex = units.indexOf(pauseUnit)
                          setPauseUnit(units[(currentIndex + 1) % units.length])
                        }}
                        className="relative flex items-center justify-center min-w-14 sm:min-w-16 px-1 text-xs sm:text-sm font-bold hover:text-primary transition"
                        title="Click to change unit"
                      >
                        {pauseTime}{pauseUnit === 'sec' ? 's' : pauseUnit === 'min' ? 'm' : 'h'}
                        <span className="material-icons-outlined text-xs opacity-50 scale-75 ml-0.5">swap_vert</span>
                      </button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="w-7 h-7 sm:w-8 sm:h-8"
                        onClick={() => {
                          const step = pauseUnit === 'hr' ? 0.5 : 1
                          setPauseTime(pauseTime + step)
                        }}
                      >
                        <span className="material-icons-outlined text-sm">add</span>
                      </Button>
                    </div>
                  </div>

                  {/* Clear Pattern Dropdown */}
                  <div className="flex items-center px-1 sm:px-2">
                    <Select value={clearPattern} onValueChange={(v) => setClearPattern(v as PreExecution)}>
                      <SelectTrigger className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border-0 p-0 shadow-none focus:ring-0 justify-center [&>svg]:hidden transition ${
                        clearPattern !== 'none' ? '!bg-primary/10' : '!bg-transparent hover:!bg-muted'
                      }`}>
                        <span className={`material-icons-outlined text-lg sm:text-xl ${
                          clearPattern !== 'none' ? 'text-primary' : 'text-muted-foreground'
                        }`}>cleaning_services</span>
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
                </div>

                {/* Play Button */}
                <button
                  onClick={handleRunPlaylist}
                  disabled={isRunning || playlistPatterns.length === 0}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-105 disabled:shadow-none disabled:hover:scale-100 transition-all duration-200 flex items-center justify-center"
                  title="Run Playlist"
                >
                  {isRunning ? (
                    <span className="material-icons-outlined text-xl sm:text-2xl animate-spin">sync</span>
                  ) : (
                    <span className="material-icons text-xl sm:text-2xl ml-0.5">play_arrow</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Playlist Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="material-icons-outlined text-primary">playlist_add</span>
              Create New Playlist
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="playlistName">Playlist Name</Label>
              <Input
                id="playlistName"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="e.g., Favorites, Morning Patterns..."
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePlaylist} className="gap-2">
              <span className="material-icons-outlined text-base">add</span>
              Create Playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Playlist Modal */}
      <Dialog open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="material-icons-outlined text-primary">edit</span>
              Rename Playlist
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="renamePlaylist">New Name</Label>
              <Input
                id="renamePlaylist"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Enter new name"
                onKeyDown={(e) => e.key === 'Enter' && handleRenamePlaylist()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setIsRenameModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenamePlaylist} className="gap-2">
              <span className="material-icons-outlined text-base">save</span>
              Save Name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pattern Picker Modal */}
      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="material-icons-outlined text-primary">playlist_add</span>
              Add Patterns to {selectedPlaylist}
            </DialogTitle>
            {playlistPatterns.length > 0 && (
              <p className="text-sm text-muted-foreground pt-1">
                Patterns will be inserted after item {selectedItemIndex + 1}
              </p>
            )}
          </DialogHeader>

          {/* Search and Filters */}
          <div className="space-y-3 py-2">
            <div className="relative">
              <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                search
              </span>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patterns..."
                className="pl-10 pr-10 h-10"
              />
              {searchQuery && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                >
                  <span className="material-icons-outlined text-lg">close</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {/* Folder dropdown - icon only on mobile, with text on sm+ */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 w-9 sm:w-auto rounded-full bg-card border-border shadow-sm text-sm px-0 sm:px-3 justify-center sm:justify-between [&>svg]:hidden sm:[&>svg]:block [&>span:last-of-type]:hidden sm:[&>span:last-of-type]:inline gap-2">
                  <span className="material-icons-outlined text-lg shrink-0">folder</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat === 'all' ? 'All Folders' : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort dropdown - icon only on mobile, with text on sm+ */}
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-9 w-9 sm:w-auto rounded-full bg-card border-border shadow-sm text-sm px-0 sm:px-3 justify-center sm:justify-between [&>svg]:hidden sm:[&>svg]:block [&>span:last-of-type]:hidden sm:[&>span:last-of-type]:inline gap-2">
                  <span className="material-icons-outlined text-lg shrink-0">sort</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="favorites">Favorites</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="date">Modified</SelectItem>
                  <SelectItem value="size">Size</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort direction - pill shaped */}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full bg-card shadow-sm"
                onClick={() => setSortAsc(!sortAsc)}
                title={sortAsc ? 'Ascending' : 'Descending'}
              >
                <span className="material-icons-outlined text-lg">
                  {sortAsc ? 'arrow_upward' : 'arrow_downward'}
                </span>
              </Button>

              <div className="flex-1" />

              {/* Selection count - compact on mobile */}
              <div className="flex items-center gap-1 sm:gap-2 text-sm bg-card rounded-full px-2 sm:px-3 py-2 shadow-sm border">
                <span className="material-icons-outlined text-base text-primary">check_circle</span>
                <span className="font-medium">{selectedPatternPaths.size}</span>
                <span className="hidden sm:inline text-muted-foreground">selected</span>
              </div>
            </div>
          </div>

          {/* Patterns Grid */}
          <div className="flex-1 overflow-y-auto border rounded-lg p-4 min-h-[300px] bg-muted/20">
            {filteredPatterns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                <div className="p-4 rounded-full bg-muted">
                  <span className="material-icons-outlined text-5xl">search_off</span>
                </div>
                <span className="text-sm">No patterns found</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {filteredPatterns.map(pattern => {
                  const isSelected = selectedPatternPaths.has(pattern.path)
                  return (
                    <div
                      key={pattern.path}
                      className="flex flex-col items-center gap-2 cursor-pointer"
                      onClick={() => togglePatternSelection(pattern.path)}
                    >
                      <div
                        className={`relative w-full aspect-square rounded-full overflow-hidden border-2 bg-muted transition-all ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-transparent hover:border-muted-foreground/30'
                        }`}
                      >
                        <LazyPatternPreview
                          path={pattern.path}
                          previewUrl={getPreviewUrl(pattern.path)}
                          requestPreview={requestPreview}
                          alt={pattern.name}
                        />
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                            <span className="material-icons text-primary-foreground" style={{ fontSize: '14px' }}>
                              check
                            </span>
                          </div>
                        )}
                      </div>
                      <p className={`text-xs truncate font-medium w-full text-center ${isSelected ? 'text-primary' : ''}`}>
                        {pattern.name}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={() => setIsPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePatterns}
              className="gap-2"
              disabled={selectedPatternPaths.size === 0}
            >
              <span className="material-icons-outlined text-base">add</span>
              Add {selectedPatternPaths.size > 0 ? `${selectedPatternPaths.size} Pattern${selectedPatternPaths.size !== 1 ? 's' : ''}` : 'Patterns'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Lazy-loading pattern preview component
interface LazyPatternPreviewProps {
  path: string
  previewUrl: string | null
  requestPreview: (path: string) => void
  alt: string
  className?: string
}

function LazyPatternPreview({ path, previewUrl, requestPreview, alt, className = '' }: LazyPatternPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hasRequestedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || previewUrl || hasRequestedRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasRequestedRef.current) {
            hasRequestedRef.current = true
            requestPreview(path)
            observer.disconnect()
          }
        })
      },
      { rootMargin: '100px' }
    )

    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [path, previewUrl, requestPreview])

  return (
    <div ref={containerRef} className={`w-full h-full flex items-center justify-center ${className}`}>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover pattern-preview"
        />
      ) : (
        <span className="material-icons-outlined text-muted-foreground text-sm sm:text-base">
          image
        </span>
      )}
    </div>
  )
}

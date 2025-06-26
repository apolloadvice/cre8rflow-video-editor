import { useEffect, useCallback } from 'react'
import { useEditorStore } from '../store/editorStore'

export function useSocket(): void {
    const setVideoSrc = useEditorStore((state) => state.setVideoSrc)

    const handleVideoUpdate = useCallback((data: { video_id: string; url: string }) => {
        setVideoSrc(data.url)
    }, [setVideoSrc])

    useEffect(() => {
        // Connect to WebSocket
        const ws = new WebSocket(import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws')

        ws.onopen = () => {
            console.log('WebSocket connected')
        }

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.type === 'video-updated') {
                handleVideoUpdate(data.payload)
            }
        }

        ws.onerror = (error) => {
            console.error('WebSocket error:', error)
        }

        ws.onclose = () => {
            console.log('WebSocket disconnected')
        }

        return () => {
            ws.close()
        }
    }, [handleVideoUpdate])
} 
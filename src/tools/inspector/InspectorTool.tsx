import { useState, useRef } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  Search, Upload, Trash2, Send, Bot, FileText,
  AlertTriangle, CheckCircle, Lightbulb,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useSettingsStore } from '@/stores/settingsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAuthStore } from '@/stores/authStore'
import { api, type AnalysisResult } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function InspectorTool() {
  const [input, setInput] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatting, setChatting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const settings = useSettingsStore()
  const toast = useNotificationStore()
  const { user } = useAuthStore()

  const provider = settings.get('ai.provider', 'openrouter')
  const apiKey = settings.get('ai.apiKey', '')
  const model = settings.get('ai.model', '')
  const baseUrl = settings.get('ai.baseUrl', '')

  const analyze = async (useAi: boolean) => {
    if (!input.trim()) {
      toast.warning('No Input', 'Paste an error or stack trace first')
      return
    }
    setAnalyzing(true)
    try {
      let analysis: AnalysisResult
      if (useAi && apiKey) {
        analysis = await api.inspector.analyzeWithAi({
          input,
          provider,
          apiKey,
          model: model || undefined,
          baseUrl: baseUrl || undefined,
        })
      } else {
        analysis = await api.inspector.analyzeOffline(input)
      }
      setResult(analysis)
      toast.success('Analysis Completed', `${analysis.confidence}% confidence`)
      if (user) {
        await api.activity.log(user.id, 'Crash log analyzed', 'inspector')
      }
    } catch (err) {
      toast.error('Analysis Failed', String(err))
    } finally {
      setAnalyzing(false)
    }
  }

  const uploadFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }, { name: 'All', extensions: ['*'] }],
    })
    if (!selected) return
    try {
      const content = await api.inspector.readFile(selected as string)
      setInput(content)
      toast.success('File Loaded')
    } catch (err) {
      toast.error('Failed to read file', String(err))
    }
  }

  const sendChat = async () => {
    if (!chatInput.trim()) return
    const newMessages = [...chatMessages, { role: 'user' as const, content: chatInput }]
    setChatMessages(newMessages)
    setChatInput('')
    setChatting(true)
    try {
      const contextMessages = [
        { role: 'system', content: `You are analyzing this error:\n${input}\n\nPrevious analysis: ${result?.summary || 'None'}` },
        ...newMessages.map((m) => ({ role: m.role, content: m.content })),
      ]
      const response = await api.inspector.chat(
        contextMessages,
        provider,
        apiKey,
        model || undefined,
        baseUrl || undefined,
      )
      setChatMessages([...newMessages, { role: 'assistant', content: response }])
    } catch (err) {
      toast.error('Chat Failed', String(err))
    } finally {
      setChatting(false)
    }
  }

  const confidenceColor = (c: number) => {
    if (c >= 80) return 'text-green-400'
    if (c >= 50) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Inspector"
        subtitle="AI-powered debugging assistant"
        actions={
          <div className="flex items-center gap-2">
            <label className="text-sm text-[#888]">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => settings.set('ai.provider', e.target.value)}
              className="rounded-lg border border-[#333] bg-[#111] px-3 py-1.5 text-sm text-white"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
              <option value="ollama">Ollama</option>
              <option value="lmstudio">LM Studio</option>
            </select>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className="flex flex-col border-r border-[#222] p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[#888] uppercase tracking-wider">Input</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setInput('')}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
              <Button variant="ghost" size="sm" onClick={uploadFile}>
                <Upload className="h-3.5 w-3.5" />
                Upload File
              </Button>
            </div>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste error, stack trace, or console output..."
            className="flex-1 rounded-xl border border-[#333] bg-[#111] p-4 text-sm text-white font-mono resize-none focus:outline-none focus:border-[#555] min-h-[200px]"
          />

          <div className="flex gap-3 mt-4">
            <Button onClick={() => analyze(false)} loading={analyzing} variant="secondary" className="flex-1">
              <Search className="h-4 w-4" />
              Analyze (Offline)
            </Button>
            <Button onClick={() => analyze(true)} loading={analyzing} className="flex-1">
              <Bot className="h-4 w-4" />
              Analyze with AI
            </Button>
          </div>
        </div>

        <div className="flex flex-col p-6 overflow-y-auto">
          {!result ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Search className="h-12 w-12 text-[#333] mb-4" />
              <p className="text-[#666]">Analysis results will appear here</p>
              <p className="text-xs text-[#444] mt-2">Offline analysis uses local knowledge base first</p>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{result.errorType}</Badge>
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-semibold', confidenceColor(result.confidence))}>
                    {result.confidence}% Confidence
                  </span>
                  <Badge variant={result.usedAi ? 'default' : 'success'}>
                    {result.source}
                  </Badge>
                </div>
              </div>

              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-[#666]" />
                  <CardTitle>Summary</CardTitle>
                </div>
                <p className="text-sm text-[#ccc]">{result.summary}</p>
              </Card>

              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <CardTitle>Root Cause</CardTitle>
                </div>
                <p className="text-sm text-[#ccc]">{result.rootCause}</p>
              </Card>

              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-green-400" />
                  <CardTitle>Suggested Fixes</CardTitle>
                </div>
                <ol className="space-y-2">
                  {result.suggestedFixes.map((fix, i) => (
                    <li key={i} className="flex items-start gap--2 text-sm text-[#ccc]">
                      <CheckCircle className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                      <span>{fix}</span>
                    </li>
                  ))}
                </ol>
              </Card>

              {result.relatedFiles.length > 0 && (
                <Card>
                  <CardTitle>Related Files</CardTitle>
                  <div className="mt-2 space-y-1">
                    {result.relatedFiles.map((file) => (
                      <p key={file} className="text-sm text-[#888] font-mono">{file}</p>
                    ))}
                  </div>
                </Card>
              )}

              <Card>
                <CardTitle>AI Chat</CardTitle>
                <CardDescription>Continue the conversation about this error</CardDescription>
                <div className="mt-4 space-y-3 max-h-48 overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg p-3 text-sm',
                        msg.role === 'user' ? 'bg-[#1a1a1a] ml-8' : 'bg-[#0a0a0a] mr-8 border border-[#222]',
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                    placeholder="Why did this happen?"
                    className="flex-1 rounded-lg border border-[#333] bg-[#0a0a0a] px-4 py-2 text-sm text-white focus:outline-none focus:border-[#555]"
                  />
                  <Button size="sm" onClick={sendChat} loading={chatting}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
      <input ref={fileInputRef} type="file" className="hidden" />
    </div>
  )
}

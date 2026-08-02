import type { ToolDefinition } from '../types/tool'

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      console.warn(`Tool "${tool.id}" is already registered. Overwriting.`)
    }
    this.tools.set(tool.id, tool)
  }

  unregister(id: string): void {
    this.tools.delete(id)
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id)
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  getSettingsSchemas() {
    return this.getAll()
      .filter((t) => t.settingsSchema)
      .map((t) => ({ toolId: t.id, toolName: t.name, schema: t.settingsSchema! }))
  }
}

export const toolRegistry = new ToolRegistry()

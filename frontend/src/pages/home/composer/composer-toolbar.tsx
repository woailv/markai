import { BookMarked, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { TemplatePickerPopover } from "./template-picker-popover"
import type { Template } from "../types"

interface ComposerToolbarProps {
  templates: Template[]
  selectedIds: Set<number>
  onToggleTemplate: (id: number) => void
  onCreateTemplate: () => void
  onEditTemplate: (id: number) => void
  onDeleteTemplate: (id: number) => void
  isDragOver: boolean
  canSend: boolean
  onSend: () => void
}

export function ComposerToolbar({
  templates,
  selectedIds,
  onToggleTemplate,
  onCreateTemplate,
  onEditTemplate,
  onDeleteTemplate,
  canSend,
  onSend,
}: ComposerToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      {/* 📚 模板选择器 */}
      <TemplatePickerPopover
        templates={templates}
        selectedIds={selectedIds}
        onToggle={onToggleTemplate}
        onCreate={onCreateTemplate}
        onEdit={onEditTemplate}
        onDelete={onDeleteTemplate}
      >
        <button
          type="button"
          title="选择模板"
          className={cn(
            "flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
          )}
        >
          <BookMarked className="h-3.5 w-3.5" />
          <span>模板</span>
        </button>
      </TemplatePickerPopover>

      {/* 右侧发送 */}
      <div className="ml-auto">
        <Button
          type="button"
          size="sm"
          disabled={!canSend}
          onClick={onSend}
          className="h-6 gap-1 px-2 text-xs"
        >
          <Send className="h-3 w-3" />
          发送
        </Button>
      </div>
    </div>
  )
}
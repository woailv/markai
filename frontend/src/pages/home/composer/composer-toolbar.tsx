import { BookMarked, ChevronDown, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { SelectedTemplatesPopover } from "./selected-templates-popover"
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
  isDragOver,
  canSend,
  onSend,
}: ComposerToolbarProps) {
  const selectedTemplates = templates.filter((t) => selectedIds.has(t.id))
  const selectedCount = selectedTemplates.length

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
          {selectedCount === 0 && <span>模板</span>}
        </button>
      </TemplatePickerPopover>

      {/* 已选模板摘要芯片 */}
      {selectedCount > 0 && (
        <SelectedTemplatesPopover
          templates={selectedTemplates}
          onRemove={onToggleTemplate}
          onEdit={onEditTemplate}
        >
          <button
            type="button"
            title="已选模板详情"
            className="flex h-6 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
          >
            <span>{selectedCount} 模板</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </SelectedTemplatesPopover>
      )}

      {/* 拖拽提示 */}
      <span className="ml-1 text-[10px] text-muted-foreground/70">
        {isDragOver ? "松开以插入文件路径" : "支持拖入文件"}
      </span>

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
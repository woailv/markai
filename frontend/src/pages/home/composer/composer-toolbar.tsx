import { BookMarked, Send, Settings2 } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useComposeSettingsStore } from "@/store"

import type { Template } from "../types"
import { SelectedTemplateTags } from "./selected-template-tags"
import { TemplatePickerPopover } from "./template-picker-popover"

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
  // 已选模板按 selectedIds 顺序解析出实际 Template 引用,过滤已被删除的项。
  const selectedTemplates = useMemo(() => {
    const map = new Map(templates.map((t) => [t.id, t]))
    const result: Template[] = []
    for (const id of selectedIds) {
      const tpl = map.get(id)
      if (tpl) result.push(tpl)
    }
    return result
  }, [templates, selectedIds])

  const copyAfterSend = useComposeSettingsStore((s) => s.copyAfterSend)
  const toggleCopyAfterSend = useComposeSettingsStore(
    (s) => s.toggleCopyAfterSend,
  )

  return (
    <div className="flex items-center gap-1.5">
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
            "flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
          )}
        >
          <BookMarked className="h-3.5 w-3.5" />
          <span>模板</span>
        </button>
      </TemplatePickerPopover>

      {/* 已选模板 tags(单行,溢出折叠为"更多") */}
      <SelectedTemplateTags
        templates={selectedTemplates}
        onOpen={onEditTemplate}
        onRemove={onToggleTemplate}
      />

      <div className="ml-auto flex shrink-0 items-center gap-1">
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

        <DropdownMenu>
          <DropdownMenuTrigger
            title="发送设置"
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">发送设置</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={copyAfterSend}
                onCheckedChange={toggleCopyAfterSend}
                onSelect={(e) => e.preventDefault()}
                className="text-xs"
              >
                发送后复制到剪贴板
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}